"""Create a dedicated Revit shared-parameter file, never overwrite an existing file."""
import pathlib
import sys

CONTENT = """# KEO prototype shared parameters
*META\tVERSION\tMINVERSION
META\t2\t1
*GROUP\tID\tNAME
GROUP\t1\tKEO
*PARAM\tGUID\tNAME\tDATATYPE\tDATACATEGORY\tGROUP\tVISIBLE\tDESCRIPTION\tUSERMODIFIABLE\tHIDEWHENNOVALUE
PARAM\t17be729c-280f-493e-bad6-e4e2ec7b88c1\tKEO_Статус\tTEXT\t\t1\t1\tKEO diagnostic status; not a numeric compliance result\t1\t0
"""

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python create-status-definition.py <new absolute .txt path>")
    path = pathlib.Path(sys.argv[1])
    if not path.is_absolute() or path.suffix.lower() != ".txt":
        raise SystemExit("Absolute .txt path required")
    with path.open("xb") as out:
        out.write(b"\xff\xfe" + CONTENT.replace("\n", "\r\n").encode("utf-16-le"))
