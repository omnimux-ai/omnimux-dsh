window.__ModuleLoader__.load({
  id: "fixture-client-loader-bad",
  factory: (require) => {
    var module = { exports: {} };
    module.exports.apply = function apply(ctx) {
      ctx.effect(() => { neverDefinedSymbol(document) }, "fixture: bad effect");
    };
    return module.exports;
  }
});
