"""Generate the storefront's two WOFF2 files from the Google Sans v13.002 release zip.

Usage: python scripts/build-storefront-fonts.py GoogleSans-v13.002.zip
Requires FontTools and Brotli. The font binaries are checked in for normal builds.
"""

from io import BytesIO
from pathlib import Path
from sys import argv
from zipfile import ZipFile

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


with ZipFile(argv[1]) as release:
    source = release.read("build/GoogleSans/variable/GoogleSans[GRAD,opsz,wght].ttf")

fonts = Path(__file__).resolve().parent.parent / "fonts"
full = TTFont(BytesIO(source), recalcTimestamp=False)
# The site uses the default grade. Keep weight and optical sizing variable.
instantiateVariableFont(full, {"GRAD": 0}, inplace=True)
full.flavor = "woff2"
full.save(fonts / "GoogleSansVariableFull-v1.woff2")

core = TTFont(fonts / "GoogleSansVariable.woff2", recalcTimestamp=False)
primary_ranges = [(0x20, 0x7E), (0xA0, 0xA0), (0x401, 0x401), (0x410, 0x44F),
                  (0x451, 0x451), (0x10A0, 0x10FF), (0x1C90, 0x1CBF)]
codepoints = {code for code in core.getBestCmap()
              if any(first <= code <= last for first, last in primary_ranges)}
options = subset.Options()
options.layout_features = ["*"]
options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=codepoints)
subsetter.subset(core)
instantiateVariableFont(core, {"GRAD": 0}, inplace=True)
core.flavor = "woff2"
core.save(fonts / "GoogleSansVariableCore-v1.woff2")
