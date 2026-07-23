FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libopenslide0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# UNI2-h(HuggingFace gated model)를 빌드 시점에 미리 캐싱
# --mount=type=secret으로 토큰이 이미지 레이어에 남지 않게 처리
RUN --mount=type=secret,id=hf_token \
    HF_TOKEN=$(cat /run/secrets/hf_token) \
    python -c "from huggingface_hub import login; import os; login(token=os.environ['HF_TOKEN'])" && \
    python -c "import timm; from timm.layers import SwiGLUPacked; import torch; \
    timm.create_model('hf-hub:MahmoodLab/UNI2-h', pretrained=True, \
    img_size=224, patch_size=14, depth=24, num_heads=24, init_values=1e-5, \
    embed_dim=1536, mlp_ratio=2.66667*2, num_classes=0, no_embed_class=True, \
    mlp_layer=SwiGLUPacked, act_layer=torch.nn.SiLU, reg_tokens=8, dynamic_img_size=True)"

ENV HF_HUB_OFFLINE=1
ENV PYTHONUNBUFFERED=1

CMD ["python", "server.py"]