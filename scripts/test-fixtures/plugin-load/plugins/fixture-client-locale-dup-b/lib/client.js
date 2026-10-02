window.__ModuleLoader__.load({
  id: "fixture-client-locale-dup-b",
  factory: (require) => {
    var module = { exports: {} };
    module.exports.name = "fixture-client-locale-dup-b";
    module.exports.inject = ["locale"];
    module.exports.apply = function apply(ctx) {
      ctx.locale.register("omnimux-shared-ns", { zh: { c: "c" }, en: { c: "c" } });
    };
    return module.exports;
  }
});
