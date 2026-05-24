import { Font } from '@react-pdf/renderer';
import { join } from 'path';

let registered = false;

function robotoFile(name: string): string {
  return join(
    process.cwd(),
    'node_modules',
    '@fontsource',
    'roboto',
    'files',
    name,
  );
}

/** Roboto pour le corps de texte des PDF propositions (fichiers locaux, pas de CDN). */
export function registerRobotoFonts(): void {
  if (registered) return;
  Font.register({
    family: 'Roboto',
    fonts: [
      {
        src: robotoFile('roboto-latin-400-normal.woff'),
        fontWeight: 'normal',
      },
      {
        src: robotoFile('roboto-latin-700-normal.woff'),
        fontWeight: 'bold',
      },
    ],
  });
  registered = true;
}
