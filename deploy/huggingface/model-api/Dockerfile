# Hugging Face Docker Space: builds this service from the public GitHub repository.
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8
WORKDIR /home/user
ARG REPO=https://github.com/Hetvi596/AeroMatrix.git
ARG BRANCH=final
RUN git clone --depth 1 --branch $BRANCH $REPO repo
WORKDIR /home/user/repo/backend/trained_model
RUN pip install --no-cache-dir --user -r requirements.txt
EXPOSE 7860
ENV AEROMATRIX_HOST=0.0.0.0 AEROMATRIX_PORT=7860
CMD ["python", "-m", "api.main"]
