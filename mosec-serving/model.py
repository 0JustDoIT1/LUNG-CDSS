import math
import torch
import torch.nn as nn
import torch.nn.functional as F


def initialize_amd_weights(module):
    if isinstance(module, (nn.Linear, nn.Conv2d)):
        nn.init.xavier_normal_(module.weight)
        if module.bias is not None:
            nn.init.zeros_(module.bias)
    elif isinstance(module, nn.LayerNorm):
        nn.init.ones_(module.weight)
        nn.init.zeros_(module.bias)


class AgentMaskDenoiseAttention(nn.Module):
    def __init__(self, dim=512, agent_num=256, num_heads=8):
        super().__init__()
        self.dim = dim
        self.agent_num = agent_num
        self.num_heads = num_heads
        self.head_dim = dim // num_heads
        self.scale = self.head_dim ** -0.5
        self.qkv = nn.Linear(dim, dim * 3, bias=False)
        self.agents = nn.Parameter(torch.randn(num_heads, agent_num, self.head_dim))
        self.mask_layer = nn.Linear(self.head_dim, self.head_dim)
        self.denoise_layer = nn.Linear(self.head_dim, self.head_dim)
        self.threshold_layer = nn.Linear(dim, 1)

    def forward(self, x, return_cls_attention=False):
        batch_size, token_count, _ = x.shape
        qkv = self.qkv(x).reshape(batch_size, token_count, 3, self.num_heads, self.head_dim).permute(2, 0, 3, 1, 4)
        query, key, value = qkv[0], qkv[1], qkv[2]
        agents = self.agents.unsqueeze(0).expand(batch_size, -1, -1, -1)

        query_to_agent = F.softmax(torch.matmul(query, agents.transpose(-1, -2)) * self.scale, dim=-1)
        agent_to_patch = F.softmax(torch.matmul(agents, key.transpose(-1, -2)), dim=-1)
        agent_value = torch.matmul(agent_to_patch, value)

        threshold_input = agent_value.permute(0, 2, 1, 3).reshape(batch_size, self.agent_num, self.dim)
        threshold = torch.sigmoid(self.threshold_layer(threshold_input).mean(dim=1, keepdim=True)).unsqueeze(1)

        mask_score = torch.sigmoid(self.mask_layer(agent_value))
        denoise_value = torch.sigmoid(self.denoise_layer(agent_value))
        mask_difference = mask_score - threshold
        hard_mask = (mask_difference > 0).to(mask_difference.dtype)
        mask = mask_difference + (hard_mask - mask_difference).detach()

        cleaned_agent_value = F.softmax(agent_value * mask + denoise_value, dim=-1)
        output = torch.matmul(query_to_agent, cleaned_agent_value)
        output = output.transpose(1, 2).contiguous().reshape(batch_size, token_count, self.dim)

        result = {"output": output}
        if return_cls_attention:
            cls_attention = torch.matmul(query_to_agent[:, :, :1, :], agent_to_patch).mean(dim=1).squeeze(1)
            result["cls_attention"] = cls_attention
        return result


class AMDResidualBlock(nn.Module):
    def __init__(self, dim=512, agent_num=256, num_heads=8):
        super().__init__()
        self.norm = nn.LayerNorm(dim)
        self.attention = AgentMaskDenoiseAttention(dim=dim, agent_num=agent_num, num_heads=num_heads)

    def forward(self, x, return_cls_attention=False):
        attention_result = self.attention(self.norm(x), return_cls_attention=return_cls_attention)
        output = x + attention_result["output"]
        result = {"output": output}
        if return_cls_attention:
            result["cls_attention"] = attention_result["cls_attention"]
        return result


class PPEG(nn.Module):
    def __init__(self, dim=512):
        super().__init__()
        self.conv7 = nn.Conv2d(dim, dim, kernel_size=7, stride=1, padding=3, groups=dim)
        self.conv5 = nn.Conv2d(dim, dim, kernel_size=5, stride=1, padding=2, groups=dim)
        self.conv3 = nn.Conv2d(dim, dim, kernel_size=3, stride=1, padding=1, groups=dim)

    def forward(self, x, grid_h, grid_w):
        batch_size, _, feature_dim = x.shape
        cls_token = x[:, :1, :]
        patch_tokens = x[:, 1:, :]
        patch_map = patch_tokens.transpose(1, 2).reshape(batch_size, feature_dim, grid_h, grid_w)
        position_features = patch_map + self.conv7(patch_map) + self.conv5(patch_map) + self.conv3(patch_map)
        position_features = position_features.flatten(2).transpose(1, 2)
        return torch.cat([cls_token, position_features], dim=1)


class AMDMIL(nn.Module):
    def __init__(self, input_dim=1536, embed_dim=384, num_classes=2, agent_num=128, num_heads=8, dropout=0.25):
        super().__init__()
        self.feature_projection = nn.Sequential(nn.Linear(input_dim, embed_dim), nn.ReLU(), nn.Dropout(dropout))
        self.cls_token = nn.Parameter(torch.randn(1, 1, embed_dim) * 1e-6)
        self.amd_block1 = AMDResidualBlock(dim=embed_dim, agent_num=agent_num, num_heads=num_heads)
        self.position_encoding = PPEG(dim=embed_dim)
        self.amd_block2 = AMDResidualBlock(dim=embed_dim, agent_num=agent_num, num_heads=num_heads)
        self.final_norm = nn.LayerNorm(embed_dim)
        self.classifier = nn.Linear(embed_dim, num_classes)
        self.apply(initialize_amd_weights)

    def forward(self, features, return_attention=False):
        if features.ndim == 2:
            features = features.unsqueeze(0)
        original_patch_count = features.shape[1]
        x = self.feature_projection(features)

        grid_size = math.ceil(math.sqrt(original_patch_count))
        padding_count = grid_size * grid_size - original_patch_count
        if padding_count > 0:
            x = torch.cat([x, x[:, :padding_count, :]], dim=1)

        batch_size = x.shape[0]
        cls_tokens = self.cls_token.expand(batch_size, -1, -1)
        x = torch.cat([cls_tokens, x], dim=1)

        x = self.amd_block1(x)["output"]
        x = self.position_encoding(x, grid_h=grid_size, grid_w=grid_size)

        second_result = self.amd_block2(x, return_cls_attention=return_attention)
        x = second_result["output"]

        slide_feature = self.final_norm(x)[:, 0, :]
        logits = self.classifier(slide_feature)

        result = {"logits": logits, "slide_feature": slide_feature}
        if return_attention:
            attention = second_result["cls_attention"][:, 1:original_patch_count + 1]
            result["attention"] = attention
        return result