FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY .margo-prod.b64 /tmp/margo-prod.b64
RUN base64 -d /tmp/margo-prod.b64 | tar -xzf - -C /app && rm -f /tmp/margo-prod.b64
COPY prado-migration/src/*.js /app/prado-migration/
COPY prado-migration/public/migracao.html /app/public/migracao.html
COPY prado-migration/public/agenda-profissional.html /app/public/agenda-profissional.html
COPY prado-migration/public/agenda-profissional.css /app/public/agenda-profissional.css
COPY prado-migration/public/agenda-profissional.js /app/public/agenda-profissional.js
RUN node /app/prado-migration/install.js /app/server.js && node --check /app/server.js && node --check /app/public/agenda-profissional.js
RUN chmod +x /app/docker-entrypoint.sh && chown -R node:node /app
ENV NODE_ENV=production
ENV MARGO_MODE=complete
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node","server.js"]
