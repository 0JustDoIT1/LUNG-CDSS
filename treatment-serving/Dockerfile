FROM vllm/vllm-openai:v0.8.3

RUN --mount=type=secret,id=hf_token \
    python3 -c "from huggingface_hub import login; login(token=open('/run/secrets/hf_token').read().strip())"

ENV HF_HOME=/root/.cache/huggingface
ENV HF_HUB_DISABLE_XET=1

ENTRYPOINT ["python3", "-m", "vllm.entrypoints.openai.api_server"]
CMD ["--model", "google/medgemma-4b-it", \
     "--max-model-len", "4096", \
     "--port", "8000", \
     "--gpu-memory-utilization", "0.7"]