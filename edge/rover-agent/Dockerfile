FROM python:3.11-slim
WORKDIR /srv
RUN pip install --no-cache-dir "numpy>=1.26" aiomqtt==2.3.0
COPY rover ./rover
# Simulated drive and camera against the real broker — for demos and testing.
CMD ["python", "-m", "rover", "run", "--sim-hardware"]
