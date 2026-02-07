# Changelog

All notable changes to Exclu will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open Graph preview Edge Function for social media link sharing
- Dynamic meta tags for creator profiles and payable links
- Vercel configuration for bot detection and routing
- Professional documentation structure (`docs/` folder)
- Architecture documentation
- Contributing guidelines
- Security documentation
- Stripe system documentation
- `.env.example` for easier setup
- MIT License

### Changed
- Improved `.gitignore` for better file exclusion
- Updated README with professional SaaS structure
- Organized documentation in `docs/` folder
- Enhanced admin user filters to work server-side across entire database
- Admin user table column order (Views before Sales)

### Fixed
- Admin filters now apply to entire user database, not just current page
- State preservation when navigating back from user overview in admin
- Border visibility in both light and dark modes
- Input background colors in settings

### Removed
- Obsolete migration documentation files
- Temporary development files
- Outdated planning documents
- Netlify configuration (using Vercel)

## [1.0.0] - 2026-01-13

### Added
- Initial release
- Creator dashboard with link management
- Public creator profiles
- Payable link system with Stripe integration
- Real-time analytics (profile views, link clicks)
- Admin panel for user management
- Stripe Connect integration
- Email delivery system for unlocked content
- Theme customization for creator profiles
- Mobile-responsive design
- Dark/light mode support

### Security
- Row-level security (RLS) on all database tables
- Secure payment processing via Stripe
- JWT-based authentication
- Environment variable protection
