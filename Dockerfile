FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY .margo-prod.b64 /tmp/margo-prod.b64
RUN base64 -d /tmp/margo-prod.b64 | tar -xzf - -C /app && rm -f /tmp/margo-prod.b64
RUN chmod +x /app/docker-entrypoint.sh && chown -R node:node /app
ENV NODE_ENV=production
ENV MARGO_MODE=complete
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node","server.js"]
