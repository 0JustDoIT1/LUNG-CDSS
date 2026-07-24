FROM vllm/vllm-openai:latest

RUN --mount=type=secret,id=hf_token \
    HF_TOKEN=$(cat /run/secrets/hf_token) \
    huggingface-cli login --token $HF_TOKEN

ENV HF_HOME=/root/.cache/huggingface

ENTRYPOINT ["python3", "-m", "vllm.entrypoints.openai.api_server"]
CMD ["--model", "google/medgemma-4b-it", \
     "--max-model-len", "8192", \
     "--port", "8000", \
     "--gpu-memory-utilization", "0.85"]