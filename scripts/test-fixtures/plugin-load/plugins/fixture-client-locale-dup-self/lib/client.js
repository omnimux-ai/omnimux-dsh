window.__ModuleLoader__.load({
  id: "fixture-client-locale-dup-self",
  factory: (require) => {
    var module = { exports: {} };
    module.exports.name = "fixture-client-locale-dup-self";
    module.exports.inject = ["locale"];
    module.exports.apply = function apply(ctx) {
      ctx.locale.register("omnimux-dup-ns", { zh: { a: "a" }, en: { a: "a" } });
      ctx.locale.register("omnimux-dup-ns", { zh: { b: "b" }, en: { b: "b" } });
    };
    return module.exports;
  }
});
