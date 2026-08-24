window.__ModuleLoader__.load({
  id: "dsh-access-mode",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // The current DSH Web composer owns the permission selector. The host
    // plugin supplies the native `permissions` projection instead.
    function apply() {}
    exports.apply = apply;
    exports.inject = [];
    return module.exports;
  }
});
