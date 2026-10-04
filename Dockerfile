FROM eclipse-temurin:21-jdk-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
        gdb python3 python3-pip curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Newest Ghidra release by default; pin with --build-arg GHIDRA_TAG=Ghidra_<version>_build
ARG GHIDRA_TAG=latest
RUN set -e; \
    if [ "$GHIDRA_TAG" = latest ]; then API=latest; else API=tags/$GHIDRA_TAG; fi; \
    URL=$(curl -fsSL https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/$API \
      | python3 -c "import json,sys; r=json.load(sys.stdin); print(next(a['browser_download_url'] for a in r['assets'] if a['name'].startswith('ghidra_') and a['name'].endswith('.zip')))"); \
    curl -fsSL -o /tmp/ghidra.zip "$URL"; \
    unzip -q /tmp/ghidra.zip -d /opt; rm /tmp/ghidra.zip; \
    ln -s /opt/ghidra_* /opt/ghidra

COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt
COPY . /app

ENV GHIDRA_INSTALL_DIR=/opt/ghidra \
    REVIEW_SANDBOX=1 \
    REVIEW_HOST=0.0.0.0 \
    REVIEW_OUT=/out
WORKDIR /tmp
EXPOSE 8000
ENTRYPOINT ["python3", "/app/review.py"]