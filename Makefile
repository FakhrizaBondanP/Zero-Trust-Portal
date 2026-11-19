.PHONY: up down build scan sbom verify

build:
	docker compose build

up:
	docker compose up -d --build

down:
	docker compose down

scan:
	@echo "=== [1/4] Hadolint Dockerfile Audit ==="
	docker run --rm -i -v "$(PWD)/security/.hadolint.yaml":/.config/hadolint.yaml hadolint/hadolint < app/backend/Dockerfile
	docker run --rm -i -v "$(PWD)/security/.hadolint.yaml":/.config/hadolint.yaml hadolint/hadolint < app/frontend/Dockerfile
	@echo "=== [2/4] Semgrep Custom SAST Scan ==="
	docker run --rm -v "$(PWD)":/src returntocorp/semgrep semgrep --config=/src/security/semgrep-rules.yml /src/app --error
	@echo "=== [3/4] Trivy Filesystem & Secret Scan ==="
	docker run --rm -v "$(PWD)":/workspace -v "$(PWD)/security/trivy.yaml":/trivy.yaml aquasec/trivy:latest fs --config /trivy.yaml /workspace
	@echo "=== [4/4] Trivy Container Image CVE Scan ==="
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$(PWD)/security/trivy.yaml":/trivy.yaml aquasec/trivy:latest image --config /trivy.yaml zero-trust-backend:v1.0.0
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "$(PWD)/security/trivy.yaml":/trivy.yaml aquasec/trivy:latest image --config /trivy.yaml zero-trust-frontend:v1.0.0

sbom:
	@echo "=== Generating CycloneDX SBOM ==="
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --format cyclonedx zero-trust-backend:v1.0.0 > sbom-backend.json
	docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest image --format cyclonedx zero-trust-frontend:v1.0.0 > sbom-frontend.json
	@echo "SBOM generated: sbom-backend.json & sbom-frontend.json"

verify:
	@echo "=== Verifying Non-Root & Read-Only Filesystem ==="
	docker exec zt-backend id
	docker exec zt-frontend id
