# Contributing

Thanks for your interest in Vulpy Commerce Core.

## Ground rules

- **Core is Apache-2.0.** Contributions to Core are welcomed under that
  license.
- **The release tree is signed.** Every shipped file is checksum-verified
  against `release-manifest.sig`/`checksums.sha256`; PRs must not break
  that verification.
- **This repo is the export surface.** The working development happens in
  Vulpy's internal monorepo; the exporter curates what lands here. If a
  change isn't in the shippable set, it will be filtered out of a release
  export — prefer PRs that land on the actual application code (Medusa
  backend, Next.js storefront, Payload CMS) and docs.

## Process

1. Open an issue or a draft PR describing the change.
2. Add tests for anything user-visible.
3. Keep the PR focused; large refactors should be coordinated first.

## License + legal

See [LICENSE](LICENSE) (Apache-2.0 for Core) and [NOTICE](NOTICE).
Pro and the add-on packs are commercial products under a separate license
at [vulpy.io/commerce](https://vulpy.io/commerce).
