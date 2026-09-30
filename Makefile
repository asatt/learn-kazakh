# Run `make` or `make help` to list the targets.

PORT ?= 8000
VENV := .venv
PYTHON := $(VENV)/bin/python

.DEFAULT_GOAL := help
.PHONY: help serve build audio clean distclean

help: ## List the targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{ printf "  %-10s %s\n", $$1, $$2 }'

serve: ## Preview the site on http://localhost:8000; set PORT to change the port
	PORT=$(PORT) node scripts/serve.mjs

build: ## Build the word list and rules into site/data/ and check the tables and links
	node scripts/build.mjs

audio: build $(PYTHON) ## Generate pronunciation audio for new or changed words
	$(PYTHON) scripts/tts.py

# Recreate the virtual environment whenever the lock file changes.
$(PYTHON): scripts/requirements.txt
	python3 -m venv $(VENV)
	$(VENV)/bin/pip install --require-hashes -r scripts/requirements.txt
	@touch $(PYTHON)

clean: ## Delete the generated word list, rules, and audio
	rm -rf site/data site/audio

distclean: clean ## Also delete the Python environment and the cached voice model
	rm -rf $(VENV) .cache
