# TEST checkpoint deployment

Run this workflow only from the deployment-tooling checkout on the TEST VPS. It
creates a detached worktree from the pushed source tag, performs strict chart
and homepage builds, publishes both images, resolves repository digests, creates
the uniformity proof and provenance manifest, and delegates recreation and
runtime checks to `scripts/deploy.sh`.

```bash
bash ./scripts/deploy-test-checkpoint.sh \
  --source-tag=d034-20260725b66-source \
  --build-id=20260725b66 \
  --checkpoint=CKPT-66 \
  --registry=localhost:5000/talaria \
  --rollback-manifest=/var/lib/talaria/checkpoints/previous.provenance.json \
  --public-origin=http://31.97.192.82:3000 \
  --compose-project=talaria
```

Use the TEST registry namespace configured for the VPS. A host-local registry is
supported if Docker can pull from it. The workflow pushes a temporary build tag
but deploys only its resolved `@sha256` reference. Remote-registry authentication
must already be configured in the platform credential store.

Append `--dry-run` first. Dry-run verifies CLI syntax, the pushed remote tag, and
the accepted rollback manifest without creating files, worktrees, images, or
containers.

Evidence and the retained deployment worktree are stored below
`/var/lib/talaria/checkpoints/<build-id>/` by default. State paths must be
absolute and outside the tooling repository so evidence cannot dirty source
preflight. A lock rejects concurrent runs for the
same build. Interrupted runs retain evidence and can be rerun; completed build
IDs fail closed rather than overwriting provenance. Use `--state-root` for a
persistent operations directory.
The origin/project pair must exactly match `scripts/test-deployment-profiles.json`.
The current TEST profile binds `http://31.97.192.82:3000` to the existing
`talaria` project. Before any build, pull, or recreation, the wrapper requires
the profile's running services, named persistent volumes, and default network.
It never provisions a missing project.

The default direct-origin mode resolves the homepage container address after
recreation. Public and direct checks fetch static host, iframe, and engine assets,
so login redirects cannot cause false timeouts. An authenticated browser check
remains available directly with `--browser-authenticated=1`.

Success output includes source tag/SHA, build ID, image digests, evidence paths,
and an exact `--deploy-existing` rollback command using the previous accepted
manifest. Keep each manifest beside its uniformity proof.

There is no option to disable provenance, source-tag, digest, rollback,
authentication, or runtime guards. The workflow does not perform SSH and must
not be given host credentials.
