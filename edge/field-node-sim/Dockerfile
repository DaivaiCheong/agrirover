FROM python:3.11-slim
WORKDIR /srv
RUN pip install --no-cache-dir aiomqtt==2.3.0
COPY sim_field_node.py .
CMD ["python", "sim_field_node.py"]
