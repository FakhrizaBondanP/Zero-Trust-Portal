FROM nginxinc/nginx-unprivileged:1.27-alpine

USER root
RUN apk upgrade --no-cache

COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 index.html /usr/share/nginx/html/index.html

USER 101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:8080/"]

CMD ["nginx", "-g", "daemon off;"]
