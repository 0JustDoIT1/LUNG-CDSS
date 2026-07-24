import torch
import torch.nn as nn


class MultiLabelAMDMIL(nn.Module):
    def __init__(
        self,
        input_dim=1536,
        embed_dim=512,
        agent_num=128,
        num_heads=4,
        num_labels=3,
        dropout=0.1
    ):
        super().__init__()

        if embed_dim % num_heads != 0:
            raise ValueError(
                f"embed_dim({embed_dim})은 num_heads({num_heads})로 나누어져야 합니다."
            )

        self.input_dim = input_dim
        self.embed_dim = embed_dim
        self.agent_num = agent_num
        self.num_heads = num_heads
        self.num_labels = num_labels

        self.feature_projection = nn.Sequential(
            nn.Linear(input_dim, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.GELU(),
            nn.Dropout(dropout)
        )

        self.agents = nn.Parameter(torch.empty(1, agent_num, embed_dim))
        nn.init.trunc_normal_(self.agents, std=0.02)

        self.agent_attention = nn.MultiheadAttention(
            embed_dim=embed_dim,
            num_heads=num_heads,
            dropout=dropout,
            batch_first=True
        )

        self.agent_norm1 = nn.LayerNorm(embed_dim)

        self.agent_ffn = nn.Sequential(
            nn.Linear(embed_dim, embed_dim * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(embed_dim * 2, embed_dim),
            nn.Dropout(dropout)
        )

        self.agent_norm2 = nn.LayerNorm(embed_dim)

        self.gene_agent_attention = nn.Linear(embed_dim, num_labels)

        self.classifier_weight = nn.Parameter(torch.empty(num_labels, embed_dim))
        self.classifier_bias = nn.Parameter(torch.zeros(num_labels))
        nn.init.xavier_uniform_(self.classifier_weight)

    def forward(self, embeddings):
        if embeddings.ndim == 2:
            embeddings = embeddings.unsqueeze(0)

        if embeddings.ndim != 3:
            raise ValueError(f"입력 shape 오류: {embeddings.shape}")

        if embeddings.shape[-1] != self.input_dim:
            raise ValueError(
                f"입력 특징 차원이 {self.input_dim}이 아닙니다: {embeddings.shape}"
            )

        batch_size = embeddings.shape[0]

        patch_features = self.feature_projection(embeddings)

        agents = self.agents.expand(batch_size, -1, -1)

        agent_output, agent_patch_attention = self.agent_attention(
            query=agents,
            key=patch_features,
            value=patch_features,
            need_weights=True,
            average_attn_weights=True
        )

        agent_features = self.agent_norm1(agents + agent_output)
        agent_features = self.agent_norm2(agent_features + self.agent_ffn(agent_features))

        gene_agent_logits = self.gene_agent_attention(agent_features).transpose(1, 2)
        gene_agent_weights = torch.softmax(gene_agent_logits, dim=-1)

        gene_embeddings = torch.bmm(gene_agent_weights, agent_features)

        logits = (gene_embeddings * self.classifier_weight.unsqueeze(0)).sum(dim=-1) + self.classifier_bias

        gene_patch_attention = torch.bmm(gene_agent_weights, agent_patch_attention)

        return {
            "logits": logits,
            "gene_embeddings": gene_embeddings,
            "gene_agent_weights": gene_agent_weights,
            "agent_patch_attention": agent_patch_attention,
            "gene_patch_attention": gene_patch_attention
        }