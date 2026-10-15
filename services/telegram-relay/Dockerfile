FROM node:24-alpine
WORKDIR /service
COPY --chown=node:node handler.mjs server.mjs ./
USER node
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
