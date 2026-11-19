# Contributing

Thanks for helping with Mesh Pilot.

## Workflow

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Fork the repository and create a short-lived branch from `main`, named `feat/<topic>`,
   `fix/<topic>` or `docs/<topic>`.
3. Keep changes focused. Add or update tests, and update `CHANGELOG.md` under **Unreleased**.
4. Run the tests: `./venv/bin/python -m pytest tests`.
5. Open a pull request into `main` and fill in the template.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`,
`chore:`, `test:`, `refactor:`.

## Versioning

The project follows [Semantic Versioning](https://semver.org). The plan for each release is in
[docs/ROADMAP.md](docs/ROADMAP.md). `VERSION` holds the current version.

## Licensing

Mesh Pilot is licensed under Apache 2.0. By contributing, you agree that your contribution is
licensed under the same terms.

## Security issues

Do not file these as public issues. Follow [SECURITY.md](SECURITY.md).
