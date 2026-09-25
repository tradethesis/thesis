"use client";

/**
 * Filtering the feed to one asset.
 *
 * The map and the feed are siblings — the map is above it, the search box inside it — so
 * the request travels as an event rather than through a provider wrapping both. It sets
 * the search the visitor could have typed, which keeps one filter in the product instead
 * of two that can disagree.
 *
 * Clicking a tile deliberately does not open a thesis. An asset is held by several beliefs
 * and belongs to none of them; picking one would imply a relationship the tile does not
 * have.
 */
export const FILTER_BY_ASSET = "thesis:filter-asset";
