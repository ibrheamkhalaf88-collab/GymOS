# ── GymOS production image ──────────────────────────────
# Multi-stage: static site served by hardened nginx:alpine
FROM nginx:1.27-alpine

# Remove default config & drop-in
RUN rm -f /etc/nginx/conf.d/default.conf

COPY docker/nginx.conf /etc/nginx/conf.d/gymos.conf
COPY . /usr/share/nginx/html

# Static assets only — no runtime secrets inside the image
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]