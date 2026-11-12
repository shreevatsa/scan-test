#!/usr/bin/env python3
"""Pack, verify and recover a Chaya PDF using PyMuPDF and the Python standard library."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tempfile

import pymupdf


ATTACHMENT = "chaya.json"
MARKER = re.compile(rb"(?m)^%chaya-book 1 length=(\d+) sha256=([0-9a-f]{64})\r?$")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def pdf_reader(data):
    reader = pymupdf.open(stream=data, filetype="pdf")
    if reader.is_encrypted:
        reader.close()
        raise ValueError("This helper requires an unencrypted PDF.")
    return reader


def validate_files(files, page_count):
    if not isinstance(files, dict):
        raise ValueError("The file map must be a JSON object.")
    for path in files:
        parts = PurePosixPath(path).parts
        if not parts or path.startswith("/") or "\\" in path or ".." in parts or str(PurePosixPath(path)) != path:
            raise ValueError(f"Invalid relative data path {path!r}.")
    manifest = files.get("book.json")
    if not isinstance(manifest, dict) or manifest.get("format") != "book-folder" or manifest.get("version") != 1:
        raise ValueError("The file map needs a book.json manifest with format book-folder and version 1.")
    book_id = manifest.get("book_id")
    if not isinstance(book_id, str) or not re.fullmatch(r"[A-Za-z0-9._-]+", book_id):
        raise ValueError("The manifest needs a valid book_id.")
    if not isinstance(manifest.get("title"), str) or not manifest["title"]:
        raise ValueError("The manifest needs a title.")
    types = files.get(manifest.get("types"))
    if not isinstance(types, dict) or types.get("format") != "types" or types.get("book_id") != book_id:
        raise ValueError("The manifest's type-list path must resolve to this book's types.")
    pages = manifest.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ValueError("The manifest needs at least one page entry.")
    seen = set()
    for page in pages:
        pid = page.get("id")
        if not isinstance(pid, str) or not re.fullmatch(r"[A-Za-z0-9._-]+", pid) or pid in seen:
            raise ValueError("Manifest page IDs must be valid and unique.")
        seen.add(pid)
        position = page.get("pdf_page")
        if type(position) is not int or not 1 <= position <= page_count:
            raise ValueError(f"Page {pid} has an invalid PDF position.")
        if any(type(page.get(key)) is not int or page[key] < 1 for key in ["width", "height"]):
            raise ValueError(f"Page {pid} needs positive integer raster dimensions.")
        path = page.get("document")
        if not isinstance(path, str) or not path:
            raise ValueError(f"Page {pid} needs a document path.")
        if page.get("valid") is True and path not in files:
            raise ValueError(f"Page {pid} is marked valid but its document is missing.")
        for document in [files.get(path), files.get(f"edits/{pid}.json")]:
            if document is None:
                continue
            if not isinstance(document, dict) or document.get("format") != "page" or document.get("book_id") != book_id:
                raise ValueError(f"Page {pid} has an invalid document header.")
            geometry = document.get("page", {})
            if geometry.get("id") != pid or any(geometry.get(key) != page[key] for key in ["width", "height"]):
                raise ValueError(f"Page {pid}'s document and manifest disagree.")
    return manifest


def read_chaya(data):
    with pdf_reader(data) as reader:
        if reader.embfile_names().count(ATTACHMENT) != 1:
            raise ValueError("Expected exactly one chaya.json attachment.")
        envelope = json.loads(reader.embfile_get(ATTACHMENT).decode("utf-8"))
        packaged_page_count = reader.page_count
    if not isinstance(envelope, dict) or envelope.get("format") != "chaya-book" or envelope.get("version") != 1:
        raise ValueError("Unsupported chaya.json envelope.")
    markers = list(MARKER.finditer(data))
    if not markers:
        raise ValueError("The PDF has no source-recovery marker.")
    marker = markers[-1]
    length = int(marker[1])
    if length > marker.start():
        raise ValueError("The recovery marker has an invalid source length.")
    original = data[:length]
    digest = sha256(original)
    if digest != marker[2].decode("ascii"):
        raise ValueError("The recovered source does not match its recorded hash.")
    metadata = envelope.get("original", {})
    if not isinstance(metadata, dict) or metadata.get("length") != length or metadata.get("sha256") != digest or not isinstance(metadata.get("name"), str):
        raise ValueError("The envelope and recovery marker disagree.")
    with pdf_reader(original) as source:
        page_count = source.page_count
    if packaged_page_count != page_count:
        raise ValueError("The packaged PDF's page count differs from the source.")
    manifest = validate_files(envelope.get("files"), page_count)
    pdf = manifest.get("pdf", {})
    if pdf.get("sha256") != digest or pdf.get("page_count") != page_count:
        raise ValueError("The manifest's source-PDF metadata is inconsistent.")
    return envelope, original


def pack(source, file_map, destination):
    data = source.read_bytes()
    with pdf_reader(data) as reader:
        has_chaya = ATTACHMENT in reader.embfile_names()
    name = source.name
    if has_chaya:
        previous, data = read_chaya(data)
        name = previous["original"]["name"]
    with pdf_reader(data) as reader:
        page_count = reader.page_count
    files = json.loads(file_map.read_text(encoding="utf-8"))
    manifest = validate_files(files, page_count)
    digest = sha256(data)
    manifest["pdf"] = {"path": "source.pdf", "name": name, "sha256": digest, "page_count": page_count}
    envelope = {
        "format": "chaya-book", "version": 1,
        "original": {"name": name, "sha256": digest, "length": len(data)},
        "saved_at_utc": datetime.now(timezone.utc).isoformat(),
        "saved_by": "transcribe-chaya-book portable helper", "files": files,
    }
    payload = json.dumps(envelope, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    marker = f"\n%chaya-book 1 length={len(data)} sha256={digest}\n".encode("ascii")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".pdf", delete=False) as output:
            temporary = Path(output.name)
            output.write(data + marker)
        with pymupdf.open(temporary) as writer:
            if not writer.can_save_incrementally():
                raise ValueError("This PDF requires a different tool for exact incremental preservation.")
            writer.embfile_add(ATTACHMENT, payload, filename=ATTACHMENT)
            writer.saveIncr()
        saved, recovered = read_chaya(temporary.read_bytes())
        if saved != envelope or recovered != data:
            raise ValueError("The output failed its data or original-byte round trip.")
        os.replace(temporary, destination)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    create = actions.add_parser("pack", help="Embed an explicit JSON file map in a source PDF.")
    create.add_argument("source", type=Path)
    create.add_argument("files", type=Path)
    create.add_argument("output", type=Path)
    verify = actions.add_parser("verify", help="Check the attachment, manifest and source recovery.")
    verify.add_argument("pdf", type=Path)
    extract = actions.add_parser("extract-original", help="Recover the source PDF after verifying it.")
    extract.add_argument("pdf", type=Path)
    extract.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.action == "pack":
            pack(args.source, args.files, args.output)
            envelope, original = read_chaya(args.output.read_bytes())
        else:
            envelope, original = read_chaya(args.pdf.read_bytes())
            if args.action == "extract-original":
                args.output.write_bytes(original)
        print(json.dumps({"book_id": envelope["files"]["book.json"]["book_id"],
            "files": len(envelope["files"]), "original_bytes": len(original),
            "original_sha256": sha256(original), "verified": True}, indent=2))
    except (OSError, ValueError, TypeError, KeyError, RuntimeError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
