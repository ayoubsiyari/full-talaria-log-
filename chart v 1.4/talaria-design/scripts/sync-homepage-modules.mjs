import fs from 'node:fs';
import path from 'node:path';
import { HOMEPAGE_FORWARDING_CONTRACTS } from '../../../scripts/lib/homepage-forwarding-contracts.mjs';

export function syncHomepageModules(modulesSrc, modulesDest) {
  if (!fs.existsSync(modulesSrc)) {
    throw new Error(`chart/modules not found: ${modulesSrc}`);
  }

  for (const [contractPath, exactWrapper] of Object.entries(HOMEPAGE_FORWARDING_CONTRACTS)) {
    const relative = contractPath.replace(/^modules\//, '');
    const canonical = path.join(modulesSrc, relative);
    const homepage = path.join(modulesDest, relative);
    if (!fs.existsSync(canonical)) {
      throw new Error(`forwarding contract canonical target missing: ${canonical}`);
    }
    if (!fs.existsSync(homepage)) {
      throw new Error(`forwarding contract wrapper missing: ${homepage}`);
    }
    if (fs.readFileSync(homepage, 'utf8') !== exactWrapper) {
      throw new Error(`forwarding contract wrapper mismatch: ${homepage}`);
    }
  }

  fs.mkdirSync(modulesDest, { recursive: true });
  fs.cpSync(modulesSrc, modulesDest, { recursive: true, force: true });

  for (const [contractPath, exactWrapper] of Object.entries(HOMEPAGE_FORWARDING_CONTRACTS)) {
    const relative = contractPath.replace(/^modules\//, '');
    fs.writeFileSync(path.join(modulesDest, relative), exactWrapper, 'utf8');
  }
}
