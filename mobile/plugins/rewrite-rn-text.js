/** Rewrite Text / TextInput imports so Geist + weight mapping apply app-wide. */
module.exports = function rewriteRnText({ types: t }) {
  return {
    name: 'rewrite-rn-text',
    visitor: {
      ImportDeclaration(path, state) {
        const filename = String(state.filename || '').replace(/\\/g, '/');
        if (filename.includes('/src/ui/AppText')) return;
        if (
          filename.includes('/node_modules/') ||
          filename.includes('/@expo/vector-icons/') ||
          filename.includes('/react-native-vector-icons/')
        ) {
          return;
        }
        if (path.node.source.value !== 'react-native') return;
        if (path.node.importKind === 'type') return;

        const keep = [];
        const moved = [];
        for (const spec of path.node.specifiers) {
          if (!t.isImportSpecifier(spec) || spec.importKind === 'type') {
            keep.push(spec);
            continue;
          }
          const imported = spec.imported;
          const name = t.isIdentifier(imported) ? imported.name : imported.value;
          if (name === 'Text' || name === 'TextInput') moved.push(spec);
          else keep.push(spec);
        }
        if (!moved.length) return;

        path.insertAfter(
          t.importDeclaration(moved, t.stringLiteral('@app/text')),
        );
        if (keep.length) path.node.specifiers = keep;
        else path.remove();
      },
    },
  };
};
