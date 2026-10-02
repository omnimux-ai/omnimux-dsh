window.__ModuleLoader__.load({
  id: "fixture-client-loader-good",
  factory: (require) => {
    var module = { exports: {} };
    module.exports.name = "fixture-client-loader-good";
    module.exports.inject = [];
    module.exports.apply = function apply(ctx) {
      ctx.effect(() => { var d = document; d.createElement("style"); }, "fixture: ok effect");
    };
    return module.exports;
  }
});
