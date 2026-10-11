FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates procps curl tar && rm -rf /var/lib/apt/lists/*
RUN npm install -g t3@0.0.46-nightly.20261009.2861 @earendil-works/pi-coding-agent@0.85.1 && npm cache clean --force
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/*
RUN npm install -g @earendil-works/pi-coding-agent@0.86.1 pi-subagents@0.77.0 && npm cache clean --force
RUN npm install -g --legacy-peer-deps pi-autoresearch@1.9.0 && npm cache clean --force
COPY autoresearch-bridge.mjs manager.mjs pi-config.mjs jev-extension.ts jev-supervisor.mjs clef-client.mjs /opt/loopfarm/
ENV HOME=/workspace/home
WORKDIR /workspace
EXPOSE 3773 3838
CMD ["node", "/opt/loopfarm/manager.mjs"]
