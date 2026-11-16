# DSH compatibility matrix

| DSH runtime | Declared | Evidence | Status |
| --- | --- | --- | --- |
| `0.2.2-rc.1` | yes (`engines.dsh` and peer range) | Current declared target; package compatibility is automated, and settings client module loading/registration contract has regression checks | Targeted, not a full matrix |
| `0.3.0` and newer | no | Upper bound is intentional; re-evaluate slot, client loader, locale, and gateway integrations before widening | Unsupported |
| `<0.2.2-rc.1` | no | Not covered by current package declarations or regression fixtures | Unsupported |

This table records what this repository declares and tests; it does not imply a real-device test against every DSH patch release. Update this matrix only with repeatable install, settings registration, authenticated route, logout, and configuration-persistence evidence.
