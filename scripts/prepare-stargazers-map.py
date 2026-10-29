"""Extract the country map as native SVG, without HTML foreignObject wrappers."""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)


def prepare(source):
    document = ET.fromstring(source)
    countries = [
        group for group in document.iter(f"{{{SVG}}}g")
        if any(path.get("id", "").isdigit() for path in group.findall(f"{{{SVG}}}path"))
    ]
    if len(countries) != 1:
        raise ValueError("Expected one country map; keeping the existing map")
    group = countries[0]
    paths = group.findall(f"{{{SVG}}}path")
    if not any(
        "fill:" in path.get("style", "")
        and "fill: #FFFFFF;" not in path.get("style", "")
        for path in paths
    ):
        raise ValueError("Generated map has no country colors; keeping the existing map")

    root = ET.Element(f"{{{SVG}}}svg", {
        "width": "480", "height": "315", "viewBox": "0 0 480 315",
        "role": "img", "aria-labelledby": "map-title",
    })
    ET.SubElement(root, f"{{{SVG}}}title", {"id": "map-title"}).text = "Stargazers Around the World"
    viewport = ET.SubElement(root, f"{{{SVG}}}svg", {
        "x": "12", "y": "12", "width": "456", "height": "291",
        "viewBox": "0 0 480 315",
    })
    viewport.append(group)
    return ET.tostring(root, encoding="unicode") + "\n"


if __name__ == "__main__":
    source, destination = map(Path, sys.argv[1:])
    result = prepare(source.read_text())
    destination.write_text(result)
