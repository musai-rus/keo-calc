// Standard-library-only, deterministic .dyn generator. No host/model access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const source = fs.readFileSync(path.join(root, 'd0_probe.py'), 'utf8').replace(/\r\n/g, '\n');
const hash = crypto.createHash('sha256').update(source).digest('hex');
const id = name => crypto.createHash('sha256').update('keo-dynamo-d0-v1:' + name).digest('hex').slice(0, 32);
const port = (key, name, description) => ({Id: id(key), Name: name, Description: description,
  UsingDefaultValue: false, Level: 2, UseLevels: false, KeepListStructure: false});
const input = (key, concrete, type, value, name, y, extra={}) => ({
  node: {ConcreteType: concrete, Id: id(key), NodeType: type, Inputs: [],
    Outputs: [port(key + '-out', '', name)], Replication: 'Disabled', Description: name,
    InputValue: value, ...extra},
  view: {Id: id(key), Name: name, IsSetAsInput: true, IsSetAsOutput: false,
    Excluded: false, ShowGeometry: false, X: 20, Y: y}
});
const controls = [
  input('config', 'CoreNodeModels.Input.StringInput, CoreNodeModels', 'StringInputNode', '', 'Config JSON path (local only)', 20),
  input('enabled', 'CoreNodeModels.Input.BoolSelector, CoreNodeModels', 'BooleanInputNode', false, 'Read test RVT (False = cancel)', 190),
  input('nonce', 'CoreNodeModels.Input.IntegerSlider, CoreNodeModels', 'NumberInputNode', 0, 'Run number (change to repeat)', 330,
    {NumberType: 'Integer', MaximumValue: 1000, MinimumValue: 0, StepValue: 1})
];
const python = {ConcreteType: 'PythonNodeModels.PythonNode, PythonNodeModels',
  Code: 'SOURCE_SHA256 = "' + hash + '"\n' + source, Engine: 'PythonNet3', VariableInputPorts: true,
  Id: id('python'), NodeType: 'PythonScriptNode', Inputs: controls.map((_, i) => port('python-in-' + i, 'IN[' + i + ']', 'Input #' + i)),
  Outputs: [port('python-out', 'OUT', 'D0 diagnostic JSON; no KEO result')], Replication: 'Disabled',
  Description: 'Read-only environment probe; explicit test-copy path and hash required.'};
const watch = {ConcreteType: 'CoreNodeModels.Watch, CoreNodeModels', Id: id('watch'), NodeType: 'ExtensionNode',
  WatchWidth: 520, WatchHeight: 430, Inputs: [port('watch-in', '', 'D0 JSON')],
  Outputs: [port('watch-out', '', 'D0 JSON')], Replication: 'Disabled', Description: 'Probe result'};
const connectors = controls.map((item, i) => ({Start: item.node.Outputs[0].Id, End: python.Inputs[i].Id, Id: id('wire-' + i), IsHidden: 'False'}));
connectors.push({Start: python.Outputs[0].Id, End: watch.Inputs[0].Id, Id: id('wire-out'), IsHidden: 'False'});
const view = (key, name, x, y, output=false) => ({Id: id(key), Name: name, IsSetAsInput: false, IsSetAsOutput: output, Excluded: false, ShowGeometry: false, X:x, Y:y});
const graph = {
  Uuid: id('graph'), IsCustomNode: false, Description: 'KEO D0: only read the explicitly configured standalone test RVT. No model writes or KEO calculation.',
  Name: 'KEO D0 - Read-only environment', ElementResolver: {ResolutionMap: {}}, Inputs: [], Outputs: [],
  Nodes: [...controls.map(item => item.node), python, watch], Connectors: connectors,
  Dependencies: [], NodeLibraryDependencies: [], EnableLegacyPolyCurveBehavior: false, Thumbnail: '', GraphDocumentationURL: '',
  ExtensionWorkspaceData: [], Author: 'keo-calc', Linting: {activeLinter: 'None', activeLinterId: '0', WarningCount: 0, ErrorCount: 0}, Bindings: [],
  View: {Dynamo: {ScaleFactor: 1, HasRunWithoutCrash: false, IsVisibleInDynamoLibrary: true, Version: '4.2.1.5887', RunType: 'Manual', RunPeriod: '100'},
    ConnectorPins: [], NodeViews: [...controls.map(item => item.view), view('python', 'D0 - read only', 440, 160), view('watch', 'D0 evidence', 700, 20, true)],
    Annotations: [], X: 20, Y: 30, Zoom: 0.8}
};
const target = path.join(root, 'KEO_D0_ReadOnly.dyn');
const content = JSON.stringify(graph, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) throw new Error('Graph differs from Python source; regenerate it');
} else fs.writeFileSync(target, content, 'utf8');
console.log(JSON.stringify({graph: path.basename(target), sourceSha256: hash, nodes: graph.Nodes.length, runType: graph.View.Dynamo.RunType}));
