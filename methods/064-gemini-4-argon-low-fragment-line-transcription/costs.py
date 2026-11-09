"""Normalize OpenAI usage and estimate standard prices with default 30-minute caching."""


def usage_breakdown(usage, pricing, service_tier):
    incoming, outgoing = usage.get("input_tokens"), usage.get("output_tokens")
    details = usage.get("input_tokens_details") or {}
    cached = details.get("cached_tokens",0)
    written = details.get("cache_write_tokens",0)
    reasoning = (usage.get("output_tokens_details") or {}).get("reasoning_tokens")
    counts = [incoming,outgoing,cached,written]
    if not all(type(v) is int and v>=0 for v in counts):
        return {"available":False,"reason":"Expected nonnegative usage counts were not returned."}
    ordinary = incoming-cached-written
    result = {
        "available":True,"input_tokens":incoming,"ordinary_input_tokens":ordinary,
        "cached_input_tokens":cached,"cache_write_input_tokens":written,
        "output_tokens_including_reasoning":outgoing,"reasoning_tokens":reasoning,
        "non_reasoning_output_tokens":None if reasoning is None else outgoing-reasoning,
        "total_token_count_matches":usage.get("total_tokens")==incoming+outgoing,
        "cache_write_lifetime":"30m (provider default)",
    }
    if ordinary<0 or not result["total_token_count_matches"] or incoming>272000:
        result["estimate_unavailable_reason"]="Token categories or long-context pricing need inspection."
        return result
    if reasoning is not None and (type(reasoning) is not int or not 0<=reasoning<=outgoing):
        result["estimate_unavailable_reason"]="Reasoning-token breakdown needs inspection."
        return result
    if service_tier not in [None,"default","standard"]:
        result["estimate_unavailable_reason"]="Returned service tier needs inspection."
        return result
    input_cost=(ordinary*pricing["input_per_million_usd"]+
                cached*pricing["cached_input_per_million_usd"]+
                written*pricing["cache_write_30m_per_million_usd"])/1_000_000
    output_cost=outgoing*pricing["output_per_million_usd"]/1_000_000
    result.update(estimated_paid_tier_input_cost_usd=input_cost,
                  estimated_paid_tier_output_cost_usd=output_cost,
                  estimated_paid_tier_total_cost_usd=input_cost+output_cost,pricing=pricing)
    return result
