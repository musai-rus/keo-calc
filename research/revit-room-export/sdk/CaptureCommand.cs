// SOURCE ONLY: not compiled or executed in Revit. See SDK.md before building.
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;
using Microsoft.Win32;
using D = System.Collections.Generic.Dictionary<string, object?>;

namespace Keo.RoomEvidence;

public sealed record CaptureRequest(string PhaseUniqueId, string[] RoomUniqueIds,
    string ExpectedSourceSha256, string ExpectedRevitBuild, string SourceCommit, string OutputPath);

[Transaction(TransactionMode.ReadOnly)]
public sealed class CaptureCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        // No manifest is installed by this repository. A future authorized host invokes this command.
        var dialog = new OpenFileDialog { Filter = "Capture request (*.json)|*.json", Multiselect = false };
        if (dialog.ShowDialog() != true) return Result.Cancelled;
        try
        {
            var request = JsonSerializer.Deserialize<CaptureRequest>(File.ReadAllText(dialog.FileName))
                ?? throw new InvalidOperationException("Empty request");
            var data = new Capture(commandData.Application, request).Read();
            // Serialize before opening output; never overwrite an existing file, including the RVT.
            var bytes = JsonSerializer.SerializeToUtf8Bytes(data, new JsonSerializerOptions { WriteIndented = true });
            if (bytes.Length > 5 * 1024 * 1024) throw new InvalidOperationException("byte-limit");
            if (!Path.IsPathFullyQualified(request.OutputPath) || Path.GetExtension(request.OutputPath) != ".json")
                throw new InvalidOperationException("Output must be a new absolute .json path");
            using var output = new FileStream(request.OutputPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            output.Write(bytes);
            return Result.Succeeded; // Raw capture only, NOT profile/binding/geometry acceptance.
        }
        catch (Exception ex)
        {
            message = "Capture refused: " + ex.GetType().Name + ": " + ex.Message;
            return Result.Failed;
        }
    }
}

internal sealed class Capture
{
    readonly UIApplication ui;
    readonly Document doc;
    readonly CaptureRequest request;
    readonly Dictionary<string, D> records = new();
    readonly HashSet<string> hosts = new();
    readonly string generation = Guid.NewGuid().ToString();
    Phase phase = null!;
    int events, segments;
    static readonly object[] EmptyPath = Array.Empty<object>();
    static readonly double[] Identity = { 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1 };
    internal Capture(UIApplication ui, CaptureRequest request)
    {
        this.ui = ui; this.request = request;
        doc = ui.ActiveUIDocument?.Document ?? throw new InvalidOperationException("No active document");
    }
    static D Obj(params (string, object?)[] values) => values.ToDictionary(x => x.Item1, x => x.Item2);
    static D Ok(object value, string source) => Obj(("status", "ok"), ("source", source), ("value", value));
    static D No(string source, string reason, string status = "unsupported") => Obj(("status", status), ("source", source), ("reason", reason));
    static D ReadResult(string source, Func<object?> read)
    {
        try { var value = read(); return value is null ? No(source, "API null; meaning unknown", "unavailable") : Ok(value, source); }
        catch (Exception ex) { return No(source, ex.GetType().Name, "error"); }
    }
    static double[] Point(XYZ p) => new[] { p.X, p.Y, p.Z };
    static double[] Matrix(Transform t) => new[] { t.BasisX.X,t.BasisY.X,t.BasisZ.X,t.Origin.X,
        t.BasisX.Y,t.BasisY.Y,t.BasisZ.Y,t.Origin.Y, t.BasisX.Z,t.BasisY.Z,t.BasisZ.Z,t.Origin.Z, 0d,0d,0d,1d };
    static string Id(ElementId id) => id.Value.ToString(CultureInfo.InvariantCulture);
    static D Ref(Element e) => Obj(("documentKey", "root"), ("uniqueId", e.UniqueId), ("elementId", Id(e.Id)));
    Element Require(ElementId id) => doc.GetElement(id) ?? throw new InvalidOperationException("Unresolved ElementId " + Id(id));
    D Reference(ElementId id) { var e = Require(id); Register(e); return Ref(e); }
    D Snapshot()
    {
        using var v = Document.GetDocumentVersion(doc);
        return Obj(("versionGuid", v.VersionGUID.ToString()), ("numberOfSaves", v.NumberOfSaves),
            ("isModified", doc.IsModified), ("generation", generation));
    }
    void OnChanged(object? sender, DocumentChangedEventArgs args) { if (args.GetDocument().Equals(doc)) events++; }
    static string Hash(Stream file) { file.Position = 0; return Convert.ToHexString(SHA256.HashData(file)).ToLowerInvariant(); }
    void CheckDiskVersion(string path)
    {
        using var info = BasicFileInfo.Extract(path);
        using var disk = info.GetDocumentVersion();
        using var memory = Document.GetDocumentVersion(doc);
        if (!disk.IsEqual(memory) || doc.IsModified) throw new InvalidOperationException("Memory differs from saved file");
    }
    internal D Read()
    {
        if (ui.Application.VersionNumber != "2026" || Environment.Version.Major != 8 ||
            typeof(Document).Assembly.GetName().Version?.Major != 26 || ui.Application.VersionBuild != request.ExpectedRevitBuild)
            throw new NotSupportedException("Only explicit Revit 2026 build / API 26 / .NET 8 supported by this source target");
        if (string.IsNullOrWhiteSpace(request.SourceCommit) || request.RoomUniqueIds is null ||
            request.RoomUniqueIds.Length is < 1 or > 256 || request.RoomUniqueIds.Distinct().Count() != request.RoomUniqueIds.Length)
            throw new InvalidOperationException("Explicit unique Room scope and producer commit required");
        if (doc.IsFamilyDocument || doc.IsLinked || doc.IsModelInCloud || doc.IsWorkshared || doc.IsModifiable || doc.IsModified ||
            !Path.IsPathFullyQualified(doc.PathName) || !File.Exists(doc.PathName))
            throw new NotSupportedException("Only unchanged saved standalone local root RVT supported; no saving/upgrading/sync performed");
        phase = doc.GetElement(request.PhaseUniqueId) as Phase ?? throw new InvalidOperationException("Explicit Phase UniqueId required");
        // Hold a read-only no-writer file handle throughout capture. Failure to acquire is a blocker.
        using var file = new FileStream(doc.PathName, FileMode.Open, FileAccess.Read, FileShare.Read);
        var hash = Hash(file);
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.ExpectedSourceSha256 ?? "", "^[0-9a-f]{64}$") || hash != request.ExpectedSourceSha256)
            throw new InvalidOperationException("source-sha256 mismatch");
        CheckDiskVersion(doc.PathName);
        var before = Snapshot();
        ui.Application.DocumentChanged += OnChanged;
        try
        {
            int order = 0;
            foreach (Phase p in doc.Phases) records.Add(p.UniqueId, Obj(("ref", Ref(p)), ("kind", "phase"), ("versionGuid", p.VersionGuid.ToString()), ("order", order++)));
            var rooms = request.RoomUniqueIds.Select(id => doc.GetElement(id) as Room ?? throw new InvalidOperationException("Selected UniqueId is not Room")).ToArray();
            foreach (var room in rooms)
                if (RoomPhase(room).Id != phase.Id || room.DesignOption is not null)
                    throw new NotSupportedException("Room phase mismatch or design option; never switch context");
            var roomData = rooms.Select(RoomData).ToArray();
            var selected = rooms.Select(x => x.UniqueId).ToHashSet();
            var openings = new List<D>();
            using var collector = new FilteredElementCollector(doc).OfClass(typeof(FamilyInstance));
            foreach (FamilyInstance fi in collector)
            {
                if (fi.Category?.Id.Value != (long)BuiltInCategory.OST_Windows && fi.Category?.Id.Value != (long)BuiltInCategory.OST_Doors) continue;
                // Enumerate all instances before filtering; exceptions cannot become an empty successful inventory.
                var from = fi.get_FromRoom(phase); var to = fi.get_ToRoom(phase); var host = fi.Host;
                if (!(host is not null && hosts.Contains(host.UniqueId)) && !(from is not null && selected.Contains(from.UniqueId)) && !(to is not null && selected.Contains(to.UniqueId))) continue;
                if (fi.DesignOption is not null || host is RevitLinkInstance) throw new NotSupportedException("Relevant option/linked host unsupported");
                Register(fi);
                D Relation(Room? r, string source)
                {
                    var rr = r is null ? No(source, "API null; not exterior", "unavailable") : Ok(Obj(("phase", Ref(phase)), ("target", Obj(("ref", Reference(r.Id)), ("path", EmptyPath)))), source);
                    rr["phase"] = Ref(phase); return rr;
                }
                openings.Add(Obj(("ref", Ref(fi)), ("path", EmptyPath),
                    ("host", host is null ? No("FamilyInstance.Host", "API null", "unavailable") : Ok(Obj(("ref", Reference(host.Id)), ("path", EmptyPath)), "FamilyInstance.Host")),
                    ("fromRoom", Relation(from, "FamilyInstance.get_FromRoom(Phase)")), ("toRoom", Relation(to, "FamilyInstance.get_ToRoom(Phase)")),
                    ("instanceTransform", ReadResult("FamilyInstance.GetTransform", () => Matrix(fi.GetTransform()))),
                    ("typeUniqueId", Require(fi.GetTypeId()).UniqueId),
                    ("locationFt", fi.Location is LocationPoint lp ? Point(lp.Point) : throw new NotSupportedException("Opening LocationPoint unavailable"))));
            }
            var after = Snapshot();
            CheckDiskVersion(doc.PathName);
            if (events != 0 || JsonSerializer.Serialize(before) != JsonSerializer.Serialize(after) || hash != Hash(file))
                throw new InvalidOperationException("Source changed during capture");
            var source = Obj(("sha256", hash), ("versionGuid", before["versionGuid"]), ("numberOfSaves", before["numberOfSaves"]),
                ("projectInformationUniqueId", doc.ProjectInformation.UniqueId));
            return Obj(("schema", "keo-room-evidence/0.1"), ("profile", "horizontal-line-plan/0.1"),
                ("exportId", Guid.NewGuid().ToString()), ("createdUtc", DateTime.UtcNow.ToString("O")),
                ("producer", Obj(("id", "keo-revit-read-only-source"), ("version", "0.1"), ("sourceCommit", request.SourceCommit))),
                ("execution", Obj(("readOnly", true), ("synthetic", false), ("executedInRevit", true), ("method", "IExternalCommand TransactionMode.ReadOnly; no transactions"))),
                ("units", Obj(("frame", "revit-internal-feet"), ("length", "ft"), ("area", "ft2"), ("volume", "ft3"), ("metresPerFoot", .3048), ("matrixConvention", "row-major-4x4-column-vector"))),
                ("sourceSnapshot", source),
                ("scope", Obj(("rootDocumentKey", "root"), ("rootPhase", Ref(phase)), ("rootOption", Obj(("kind", "main-model"))), ("rootTransform", Identity), ("complete", true), ("rooms", rooms.Select(r => Obj(("ref", Ref(r)), ("path", EmptyPath))).ToArray()))),
                ("documents", new[] { Obj(("key", "root"), ("identity", Obj(("kind", "saved-rvt-sha256"), ("value", hash))), ("projectInformationUniqueId", doc.ProjectInformation.UniqueId),
                    ("revit", Obj(("product", ui.Application.VersionName), ("version", ui.Application.VersionNumber), ("build", ui.Application.VersionBuild), ("apiVersion", typeof(Document).Assembly.GetName().Version!.ToString()))),
                    ("before", before), ("after", after), ("documentChangedEvents", events)) }),
                ("elements", records.Values.ToArray()), ("rooms", roomData),
                ("openings", Ok(Obj(("complete", true), ("scope", "selected-room-hosts-and-phase-relations"), ("items", openings)), "FilteredElementCollector + selected hosts and explicit phase relations")));
        }
        finally { ui.Application.DocumentChanged -= OnChanged; }
    }
    Phase RoomPhase(Room r)
    {
        var p = r.get_Parameter(BuiltInParameter.ROOM_PHASE_ID);
        if (p is null || p.StorageType != StorageType.ElementId || Require(p.AsElementId()) is not Phase value)
            throw new NotSupportedException("ROOM_PHASE_ID unavailable; CreatedPhaseId is not a substitute");
        return value;
    }
    void Register(Element e)
    {
        if (records.ContainsKey(e.UniqueId)) return;
        if (records.Count >= 20000) throw new InvalidOperationException("element-limit");
        if (e.Document != doc || e is RevitLinkInstance || e.DesignOption is not null) throw new NotSupportedException("Foreign/link/option element unsupported");
        var value = Obj(("ref", Ref(e)), ("versionGuid", e.VersionGuid.ToString()));
        records.Add(e.UniqueId, value);
        if (e is Level level) { value["kind"] = "level"; value["elevationFt"] = level.ProjectElevation; return; }
        if (e is Phase) throw new InvalidOperationException("Phase registry incomplete");
        var cat = e.Category ?? throw new NotSupportedException("Missing category");
        var bic = (BuiltInCategory)cat.Id.Value;
        var kind = bic switch { BuiltInCategory.OST_Rooms => "room", BuiltInCategory.OST_Walls => "wall", BuiltInCategory.OST_RoomSeparationLines => "room-separator", BuiltInCategory.OST_Windows => "window", BuiltInCategory.OST_Doors => "door", _ => "other" };
        value["kind"] = kind;
        value["phase"] = Ref(e is Room room ? RoomPhase(room) : phase);
        value["level"] = Reference(e.LevelId);
        value["option"] = Obj(("kind", "main-model"));
        var hasPhases = e.HasPhases();
        value["lifecycleCapability"] = Ok(hasPhases, "Element.HasPhases");
        value["createdPhase"] = !hasPhases ? No("Element.CreatedPhaseId", "Element.HasPhases=false", "not-applicable") : ReadResult("Element.CreatedPhaseId", () => Reference(e.CreatedPhaseId));
        value["demolishedPhase"] = !hasPhases ? No("Element.DemolishedPhaseId", "Element.HasPhases=false", "not-applicable") : e.DemolishedPhaseId == ElementId.InvalidElementId ? No("Element.DemolishedPhaseId", "InvalidElementId: no demolition", "not-applicable") : ReadResult("Element.DemolishedPhaseId", () => Reference(e.DemolishedPhaseId));
        value["category"] = Obj(("id", Id(cat.Id)), ("builtInCategory", bic.ToString()), ("source", "Element.Category.Id / BuiltInCategory"));
        value["roomBounding"] = kind == "room-separator" ? Ok(true, "Native BoundarySegment generator + OST_RoomSeparationLines semantics") : ReadResult("Element.get_Parameter(WALL_ATTR_ROOM_BOUNDING)", () => {
            var p = e.get_Parameter(BuiltInParameter.WALL_ATTR_ROOM_BOUNDING);
            return p is not null && p.StorageType == StorageType.Integer ? p.AsInteger() == 1 : null;
        });
    }
    D RoomData(Room r)
    {
        Register(r);
        var location = ReadResult("Room.Location/LocationPoint.Point", () => {
            if (r.Location is not LocationPoint lp) return null;
            var p = lp.Point;
            return Obj(("kind", "LocationPoint"), ("point", Point(p)), ("containment", ReadResult("Room.IsPointInRoom", () => Obj(("point", Point(p)), ("phase", Ref(RoomPhase(r))), ("room", Ref(r)), ("inside", r.IsPointInRoom(p))))));
        });
        var computation = r.Level.get_Parameter(BuiltInParameter.LEVEL_ROOM_COMPUTATION_HEIGHT);
        if (computation is null || computation.StorageType != StorageType.Double) throw new NotSupportedException("Level computation height unavailable");
        var boundaries = ReadResult("Room.GetBoundarySegments", () => {
            using var options = new SpatialElementBoundaryOptions { SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish, StoreFreeBoundaryFaces = true };
            var loops = r.GetBoundarySegments(options);
            if (loops is null) return null;
            var result = new List<D>(); double? z = null;
            try
            {
                foreach (var loop in loops)
                {
                    if (loop.Count > 512 || (segments += loop.Count) > 8192) throw new NotSupportedException("segment-limit");
                    var output = new List<D>();
                    foreach (var segment in loop)
                    {
                        using var curve = segment.GetCurve();
                        D shape;
                        if (curve is Line && curve.IsBound)
                        {
                            var a = curve.GetEndPoint(0); var b = curve.GetEndPoint(1); z ??= a.Z;
                            shape = Obj(("kind", "Line"), ("start", Point(a)), ("end", Point(b)));
                        }
                        else shape = Obj(("kind", curve.GetType().Name), ("status", "unsupported"), ("reason", "Native non-Line retained; no tessellation/chord/flattening"));
                        var generator = ReadResult("BoundarySegment.ElementId/LinkElementId", () => {
                            if (segment.LinkElementId != ElementId.InvalidElementId || Require(segment.ElementId) is RevitLinkInstance)
                                throw new NotSupportedException("Linked boundary generator unsupported in SDK capture 0.1");
                            var e = Require(segment.ElementId); Register(e); hosts.Add(e.UniqueId);
                            return Obj(("ref", Ref(e)), ("path", EmptyPath));
                        });
                        output.Add(Obj(("index", output.Count), ("curve", shape), ("generator", generator)));
                    }
                    result.Add(Obj(("segments", output)));
                }
                return Obj(("location", "Finish"), ("storeFreeBoundaryFaces", true), ("complete", true), ("planeZFt", z), ("loops", result));
            }
            finally { foreach (var loop in loops) foreach (var segment in loop) segment.Dispose(); }
        });
        return Obj(("ref", Ref(r)), ("path", EmptyPath), ("number", r.Number), ("name", r.Name), ("placement", r.Location is LocationPoint ? "placed" : "unplaced"),
            ("properties", Obj(("areaFt2", ReadResult("Room.Area", () => r.Area)), ("perimeterFt", ReadResult("Room.Perimeter", () => r.Perimeter)), ("volumeFt3", ReadResult("Room.Volume", () => r.Volume)))),
            ("limits", Obj(("lowerLevel", Reference(r.LevelId)), ("upperLevel", Reference(r.UpperLimit.Id)), ("lowerOffsetFt", r.BaseOffset), ("upperOffsetFt", r.LimitOffset), ("computationHeightFt", computation.AsDouble()))),
            ("location", location), ("boundaries", boundaries), ("section", No("SDK capture 0.1", "Room solid section at 1.2 m not implemented; API plan boundaries only")));
    }
}
