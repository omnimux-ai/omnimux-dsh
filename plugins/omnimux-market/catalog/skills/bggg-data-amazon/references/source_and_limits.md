# Source and tested behavior

The bundled core scraper derives from the MIT-licensed public project `mrlong0129/amazon-review-scraper` as locally evaluated in this workspace. The upstream license is retained in `upstream_LICENSE`. Its route is:

```text
https://www.woot.com/review/Reviews/{ASIN}
```

with query parameters such as `filter`, `sort`, `page` or `pagingNext`, and `isVerified=false`.

In the SampleIngredient VOC run, the workflow collected more than 1,000 raw Amazon written-review rows across multiple ASINs. The reliable operational pattern was:

1. run only two workers;
2. use `full` for two core ASINs and `basic` for breadth;
3. inspect stderr because a star-filter request can fail while the upstream program exits zero;
4. retry up to three times;
5. union every valid attempt before dedupe;
6. parse dates from `OriginDescription`;
7. retain null `native_id` rather than inventing an Amazon review ID.

This is an empirical best practice, not a guarantee that the Woot endpoint will remain stable.
