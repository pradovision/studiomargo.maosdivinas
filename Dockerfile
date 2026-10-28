FROM node:22-alpine
WORKDIR /app
COPY .margo-prod.b64 /tmp/margo-prod.b64
RUN base64 -d /tmp/margo-prod.b64 | tar -xzf - -C /app && rm -f /tmp/margo-prod.b64
ENV NODE_ENV=production
ENV MARGO_MODE=complete
EXPOSE 3000
CMD ["node","server.js"]
