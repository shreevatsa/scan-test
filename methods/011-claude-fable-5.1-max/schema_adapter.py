"""Adapt the frozen JSON Schema to Claude's supported structured-output subset."""
import json


def to_api_schema(value):
    if isinstance(value,list):
        return [to_api_schema(item) for item in value]
    if not isinstance(value,dict):
        return value
    unsupported = {}
    result = {}
    for key,item in value.items():
        if key in {"minimum","maximum","maxItems"} or (key=="minItems" and item not in [0,1]):
            unsupported[key] = item
        else:
            result[key] = to_api_schema(item)
    if unsupported:
        prefix = result.get("description","")
        result["description"] = (prefix+" Constraints: "+json.dumps(unsupported,separators=(",",":"))+".").strip()
    return result
