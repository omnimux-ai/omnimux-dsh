window.__ModuleLoader__.load({
  id: "fixture-client-locale-dup-a",
  factory: (require) => {
    var module = { exports: {} };
    module.exports.name = "fixture-client-locale-dup-a";
    module.exports.inject = ["locale"];
    module.exports.apply = function apply(ctx) {
      ctx.locale.register("omnimux-shared-ns", { zh: { a: "a" }, en: { a: "a" } });
    };
    return module.exports;
  }
});
