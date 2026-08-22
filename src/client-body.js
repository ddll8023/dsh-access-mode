const React = require("react");
const {
  Menu,
  IconChevronDownOutline14,
} = require("@deepseek-ai/dsh-client-ui-primitives");

const OPTIONS = [
  { value: "default", label: "Default" },
  { value: "no-edit", label: "No Edit" },
  { value: "auto", label: "Auto" },
];

const ACCESS_MODE_CSS = `
.dsh-access-mode-root {
  display: inline-flex;
  align-items: center;
  margin-inline-start: -4px;
  margin-inline-end: 6px;
}

.dsh-access-mode-trigger {
  min-width: 0;
  max-width: 220px;
  height: 28px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 24px;
  outline: none;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 8px;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  display: inline-flex;
}

.dsh-access-mode-trigger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-access-mode-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);
}

.dsh-access-mode-trigger:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}

.dsh-access-mode-label {
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
}

.dsh-access-mode-chevron {
  color: var(--dsw-alias-label-caption);
  flex: none;
  transition: transform 0.12s;
  display: inline-flex;
}

.dsh-access-mode-chevron-open {
  transform: rotate(180deg);
}
`;

function installStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector('style[data-plugin-css="dsh-access-mode"]') !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-access-mode";
  tag.dataset.pluginCss = "dsh-access-mode";
  tag.textContent = ACCESS_MODE_CSS;
  document.head.appendChild(tag);
}

installStyles();

function commandError(result) {
  if (!result.ok) return result.error?.message ?? "Unable to change access mode";
  const value = result.value;
  if (value === undefined) return "Unable to change access mode";
  if (value.result?.kind === "error") return value.result.text ?? "Unable to change access mode";
  return undefined;
}

function AccessModeControl({ useProjection, sessionId, execute }) {
  const projection = useProjection("accessMode");
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const alive = React.useRef(true);

  React.useEffect(() => () => {
    alive.current = false;
  }, []);

  if (projection === undefined) return null;
  const current = projection.currentValue;
  const options = Array.isArray(projection.options) ? projection.options : OPTIONS;
  const items = options.map((option) => ({
    id: option.value,
    label: option.name ?? option.label ?? option.value,
  }));
  const currentOption = options.find((option) => option.value === current);
  const currentLabel = currentOption?.name ?? currentOption?.label ?? current;

  const choose = (next) => {
    setOpen(false);
    if (next === current || pending) return;
    setPending(true);
    setFailed(false);
    Promise.resolve()
      .then(() => execute(sessionId, `/access-mode ${next}`))
      .then((result) => {
        const error = commandError(result);
        if (!alive.current) return;
        setPending(false);
        setFailed(error !== undefined);
      })
      .catch(() => {
        if (!alive.current) return;
        setPending(false);
        setFailed(true);
      });
  };

  return React.createElement(Menu, {
    open,
    items,
    selectedId: current,
    onSelect: choose,
    onClose: () => setOpen(false),
    side: "top",
    className: "dsh-access-mode-root",
    anchor: React.createElement(
      "button",
      {
        type: "button",
        className: "dsh-access-mode-trigger",
        disabled: pending,
        onClick: () => setOpen((value) => !value),
        title: failed ? "Unable to change access mode" : currentLabel,
        "aria-label": `Access mode, current: ${currentLabel}`,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-invalid": failed ? "true" : undefined,
      },
      React.createElement(
        "span",
        { className: "dsh-access-mode-label" },
        currentLabel,
      ),
      React.createElement(
        "span",
        {
          className: open
            ? "dsh-access-mode-chevron dsh-access-mode-chevron-open"
            : "dsh-access-mode-chevron",
          "aria-hidden": true,
        },
        React.createElement(IconChevronDownOutline14),
      ),
    ),
  });
}

function apply(ctx) {
  ctx.slots.inject("conversation.input.left", () => ctx.slots.register(
    {
      name: "conversation.input.left",
      id: "dsh-access-mode",
      order: -100,
    },
    (props) => React.createElement(AccessModeControl, {
      ...props,
      execute: (sessionId, line) => ctx.remote.commands.execute(sessionId, line, []),
    }),
  ));
}

exports.apply = apply;
exports.inject = ["slots", "remote", "remote.commands"];
