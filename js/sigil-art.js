/* Baked braille sigils for the tool cards and their hero.

   OCTO_SIGIL  b3rt1ng's octopus art at 65 x 30 cells, reduced here to 20 x 9:
               a BOX average of the lit dots thresholded at 100/255. Lower and
               the arms bleed into one mass, higher and the mantle outline
               breaks up.

   KOI_SIGIL   lifted out of koi's own CLI (src/koi/utils/ui.py, small_art),
               stripped of its colour tokens and the wordmark that follows it
               on each line. Already 18 cells wide, so it is used at full size
               - reducing it would throw away detail for nothing.

   Neither needs aspect correction: both are already braille, so their
   proportions are already right for display, unlike art built from a photo.

   Regenerate with bake_sigils.py rather than editing a row by hand.        */

const OCTO_SIGIL = [
  '⠀⠀⠀⠀⠀⢀⡰⠊⠉⠉⠻⣷⣄⠀⠀⠀⠀⠀⠀⠀',
  '⣠⣤⢄⠀⠀⣿⠀⠀⠀⠀⢠⣿⣿⣆⢠⣤⣄⠀⠀⠀',
  '⣟⡍⢻⠃⢘⡿⠀⠀⠀⠀⢛⣿⡿⠃⣿⡍⠻⠀⠀⠀',
  '⠀⠀⣾⣷⣽⡗⢷⣼⣆⣠⠎⠉⣿⣤⣿⢣⣶⡶⠷⣦',
  '⠀⠀⢻⣿⣾⢿⣶⡎⣡⣛⣶⣾⣿⣿⢃⣸⡿⢁⡛⠋',
  '⢀⣤⣤⣿⣱⣿⢏⣾⣿⣿⣎⠿⣿⣿⣿⣯⣶⢿⣿⡆',
  '⠸⡿⣍⡷⠋⢃⣾⣿⣿⡉⠙⢷⡍⢯⠉⣹⣿⣾⠿⠁',
  '⠀⢻⡋⠀⠆⣼⡟⢸⣿⢇⣀⠈⠻⢷⣶⣿⡟⠀⠀⠀',
  '⠀⠙⠁⠀⠘⢻⢧⡾⠿⠿⠙⠃⠀⠀⠉⠀⠀⠀⠀⠀',
];

const KOI_SIGIL = [
  '⢠⣀⠀⠈⠑⢶⣦⣤⡴⢶⠶⣶⣶⣤⡀⠀⠀⠀',
  '⠀⠈⠉⢲⠤⠺⣿⣿⣧⣿⣿⣋⢠⣿⣿⣄⠀⠀',
  '⠀⠀⡰⠃⢀⣴⡿⠟⠁⠺⢝⣿⣿⣿⣿⣿⡆⠀',
  '⠀⠾⠵⠖⠋⠁⣀⣀⣠⣮⣭⣼⣷⣞⣥⣹⡇⠀',
  '⠀⠀⠀⢀⣤⡺⠿⠿⣿⣿⣿⣶⣇⣨⣿⣿⠁⠀',
  '⠀⢠⢶⣿⠿⠃⠀⣀⡁⠀⣿⣿⣼⣿⣿⣏⡑⡄',
  '⢰⣁⡐⠰⠆⣰⣶⣿⣿⡿⠛⠻⡋⠀⠉⠉⠁⠀',
  '⠀⠈⠏⠏⠉⠉⠉⠈⠛⠤⣀⣠⡽⠀⠀⠀⠀⠀',
];
