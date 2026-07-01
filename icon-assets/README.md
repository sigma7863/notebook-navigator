# Icon Assets

Icon font files and metadata for external icon providers.

## Usage

From this directory:

```bash
# Update all icon packs
../scripts/update-icon-packs.sh

# Check for updates without downloading
../scripts/update-icon-packs.sh --check-only

# Regenerate generated TypeScript files from local icon-assets
../scripts/update-icon-packs.sh --generate-only

# Update specific packs
../scripts/update-icon-packs.sh fontawesome simple-icons

# Force update even if already up to date
../scripts/update-icon-packs.sh --force
```

## Structure

- `scripts/` - Update scripts and utilities
  - `config/` - Individual icon pack configurations
  - `shared.ts` - Shared utilities and types
  - `update-icon-packs.ts` - Main update script
- `[pack-name]/` - Downloaded icon assets for each pack
  - Current font file (.woff/.woff2)
  - Current metadata JSON
  - `latest.json` - Published version manifest
  - Versioned subdirectories with archived asset copies

## Supported Icon Packs

- Bootstrap Icons
- FontAwesome
- Google Material Icons
- Phosphor Icons
- RPG-Awesome
- Simple Icons

## Configuration

Each icon pack has its own configuration file in `scripts/config/` that defines:

- Current version
- Download URLs
- Output filenames and font MIME type
- Custom metadata processing logic
- Version checking method

## Generated Files

Running the updater rewrites `latest.json` files for processed packs and regenerates:

- `src/services/icons/external/bundledManifests.ts`
- `src/generated/iconizeReverseMaps.ts`

Use `../scripts/update-icon-packs.sh --generate-only` when local asset files are already current and only the generated TypeScript files need to be refreshed.
