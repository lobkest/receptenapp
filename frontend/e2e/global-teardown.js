import { execFileSync } from 'node:child_process'
import process from 'node:process'

// Maakt de testdatabase leeg na de e2e-run: recepten, stappen en ook losse ingrediënten.
// bin/rails test merkt daar niets van: dat laadt zijn eigen fixtures.
export default function globalTeardown() {
  execFileSync('bin/rails', ['db:truncate_all'], {
    cwd: '..',
    env: { ...process.env, RAILS_ENV: 'test' },
    stdio: 'inherit',
  })
}
