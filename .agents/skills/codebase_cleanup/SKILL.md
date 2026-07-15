---
name: codebase_cleanup
description: >
  Performs a complete codebase cleanup and optimization. Identifies and removes
  unused files, dead code, duplicate logic, unused dependencies, and unused
  assets. Simplifies components, improves project structure, cleans imports and
  types, and improves readability without changing application functionality.
---

# Senior Codebase Cleanup & Optimization Prompt

You are a Principal Software Engineer, Staff Software Architect, and Senior Code Quality Engineer with extensive experience maintaining large production codebases.

Your task is to perform a COMPLETE cleanup of my entire repository.

Your primary goal is to reduce technical debt, remove unnecessary code, simplify the project, and improve maintainability **without changing the application's functionality or introducing regressions**.

Treat this as preparing the project for a production release.

---

# Objectives

Perform a full repository audit and cleanup.

## 1. Remove Unused Files

Identify and remove:

* unused components
* unused pages
* unused routes
* unused layouts
* unused utilities
* unused hooks
* unused helpers
* unused services
* unused contexts
* unused providers
* unused middleware
* unused API routes
* unused scripts
* unused assets
* unused images
* unused icons
* unused fonts
* unused CSS files
* unused SCSS files
* unused configuration files
* unused environment examples
* abandoned experimental files
* backup files
* temporary files
* duplicate files
* old migration files that are no longer needed
* obsolete documentation
* sample/demo files that are not part of production

Only delete files after confirming they are not referenced anywhere in the project.

---

## 2. Remove Dead Code

Find and remove:

* unused functions
* unused classes
* unused interfaces
* unused types
* unused enums
* unused variables
* unused constants
* unused exports
* unused imports
* unreachable code
* commented-out code
* obsolete feature flags
* deprecated implementations
* duplicate logic
* unused utility methods
* unused API helpers
* unused React hooks
* unused state
* unused refs
* unused callbacks
* unused memoization
* unused effects

---

## 3. Remove Duplicate Code

Identify duplicated logic across the repository.

Refactor by:

* extracting reusable utilities
* creating shared hooks
* creating reusable components
* removing repeated business logic
* consolidating helper functions

Maintain readability over excessive abstraction.

---

## 4. Remove Unused Dependencies

Inspect package.json.

Remove packages that are never used.

Check:

* dependencies
* devDependencies
* peerDependencies

Verify:

* imports
* build process
* scripts
* runtime usage

Never remove packages that are required indirectly.

---

## 5. Remove Unused Assets

Delete:

* unused SVGs
* unused PNGs
* unused JPGs
* unused fonts
* unused videos
* unused icons
* unused static assets

Only if completely unused.

---

## 6. Simplify Components

Improve components by removing:

* unnecessary props
* unused state
* unnecessary effects
* unnecessary memoization
* unnecessary callbacks
* duplicate rendering logic
* deeply nested JSX
* redundant wrappers

Keep behavior identical.

---

## 7. Simplify Project Structure

Improve folder organization.

Remove:

* empty folders
* duplicate folders
* unnecessary nesting
* abandoned modules

Follow a clean, scalable project structure.

---

## 8. Clean Imports

For every file:

* remove unused imports
* sort imports consistently
* remove duplicate imports
* merge imports where appropriate
* remove circular imports when possible

---

## 9. Clean Types

Remove:

* duplicate interfaces
* unused interfaces
* unused types
* unnecessary generic types
* obsolete type aliases

Consolidate shared types.

---

## 10. Clean Styling

Remove:

* unused CSS classes
* unused Tailwind classes
* duplicate styles
* obsolete styling
* redundant wrappers

---

## 11. Improve Readability

Refactor where appropriate:

* simplify complex conditions
* simplify nested logic
* improve naming
* remove magic numbers
* remove unnecessary comments
* improve consistency

Do not over-engineer.

---

## 12. Detect Legacy Code

Identify:

* old implementations
* deprecated utilities
* obsolete APIs
* legacy feature flags
* abandoned experiments

Remove them if they are no longer used.

---

## 13. Verify References

Before deleting anything:

Search the entire repository to ensure there are **no references**.

Check:

* imports
* dynamic imports
* route definitions
* configuration
* reflection
* runtime registration
* build scripts
* environment loading

Never delete something that is still used indirectly.

---

## 14. Preserve Functionality

Do NOT change:

* application behavior
* APIs
* database schema
* business logic
* UI behavior
* routing
* authentication
* authorization

Only remove unnecessary code.

---

## 15. Testing

After cleanup:

* Fix build errors.
* Fix TypeScript errors.
* Fix lint errors.
* Fix import errors.
* Fix runtime errors.
* Remove broken references.
* Ensure the application compiles successfully.
* Ensure all tests pass.

---

# Deliverables

At the end, provide a cleanup report containing:

1. Files Removed
2. Components Removed
3. Utilities Removed
4. Assets Removed
5. Dependencies Removed
6. Imports Cleaned
7. Duplicate Code Eliminated
8. Dead Code Removed
9. Folder Structure Improvements
10. Bundle Size Improvements (if measurable)
11. Build Status
12. TypeScript Status
13. Lint Status
14. Remaining Technical Debt
15. Summary of Changes

---

# Rules

* Never delete code without verifying it is unused.
* Preserve existing functionality.
* Prefer small, safe refactors over large rewrites.
* Explain why each significant removal is safe.
* Keep the codebase clean, readable, and maintainable.
* Continue iterating until no significant unused files, dead code, duplicate logic, or unnecessary dependencies remain.

Your goal is to leave the repository as lean, organized, and maintainable as possible while preserving 100% of its intended functionality.
