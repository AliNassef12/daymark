FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY service.py .
RUN useradd --uid 10001 --create-home daymark && mkdir /data && chown daymark /data
USER daymark
ENV HOST=0.0.0.0 PORT=8080 REMINDER_DB=/data/reminders.sqlite3
EXPOSE 8080
CMD ["python", "service.py"]
