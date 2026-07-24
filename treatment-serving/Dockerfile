FROM vllm/vllm-openai:latest

RUN --mount=type=secret,id=hf_token \
    python3 -c "from huggingface_hub import login; login(token=open('/run/secrets/hf_token').read().strip())"

ENV HF_HOME=/root/.cache/huggingface

ENTRYPOINT ["python3", "-m", "vllm.entrypoints.openai.api_server"]
CMD ["--model", "google/medgemma-4b-it", \
     "--max-model-len", "8192", \
     "--port", "8000", \
     "--gpu-memory-utilization", "0.85"]# trigger rebuild
