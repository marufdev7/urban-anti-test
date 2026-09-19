"""T10.4 load harness. Not imported by the API or worker — run only via the `loadgen` service.

`locustfile.py` holds the load profile and the NFR-2 pass/fail gate. It is a package under
`urbenmend/` rather than a top-level `loadtest/` directory for a boring but decisive reason:
`pyproject.toml` scopes mypy to `files = ["urbenmend"]` and pytest to
`testpaths = ["urbenmend"]`, so a top-level directory would be linted and then never
type-checked or tested again.
"""
