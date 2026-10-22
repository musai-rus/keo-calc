// Experimental, read-only Revit 2027.3 command. Compiled on MRM; NOT executed in Revit.
// Emits raw Room evidence only; it does NOT certify daylight geometry or compute KEO.
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using Autodesk.Revit.UI;
using Microsoft.Win32;
using ComboBox = System.Windows.Controls.ComboBox;
using Button = System.Windows.Controls.Button;

namespace Keo.RoomEvidence;

[Transaction(TransactionMode.ReadOnly)]
public sealed class RoomFilterCaptureCommand : IExternalCommand
{
    public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
    {
        try
        {
            var ui = commandData.Application;
            var doc = ui.ActiveUIDocument?.Document ?? throw new InvalidOperationException("No active Revit document");
            // MVP limitation inherited from Capture.Read: no cloud/workshared/linked/dirty model.
            if (doc.IsFamilyDocument || doc.IsLinked || doc.IsModelInCloud || doc.IsWorkshared ||
                doc.IsModifiable || doc.IsModified || !Path.IsPathFullyQualified(doc.PathName) ||
                !File.Exists(doc.PathName))
                throw new NotSupportedException("Use a saved unchanged standalone local RVT copy; linked, cloud, dirty and workshared sources are not supported in MVP");

            var sourceCommit = typeof(RoomFilterCaptureCommand).Assembly
                .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "";
            if (!Regex.IsMatch(sourceCommit, "^[0-9a-f]{40}$"))
                throw new InvalidOperationException("Assembly source commit is not the exact Git SHA. Build with -p:SourceCommit=<40 hex SHA>");

            var rooms = new FilteredElementCollector(doc)
                .OfCategory(BuiltInCategory.OST_Rooms).WhereElementIsNotElementType()
                .OfType<Room>().OrderBy(r => r.UniqueId, StringComparer.Ordinal).ToArray();
            if (rooms.Length == 0) throw new InvalidOperationException("No native Revit Rooms found");
            var phases = doc.Phases.Cast<Phase>().ToArray();
            if (phases.Length == 0) throw new InvalidOperationException("No Revit phases found");

            var chooser = new RoomFilterWindow(doc, rooms, phases);
            if (chooser.ShowDialog() != true) return Result.Cancelled;
            var selected = chooser.SelectedRooms;
            var phase = chooser.SelectedPhase;
            if (phase is null || selected.Length is < 1 or > 256)
                throw new InvalidOperationException("Select 1–256 native Rooms in one phase; narrow the parameter/value filter");

            var target = new SaveFileDialog { Title = "Новый read-only снимок Room evidence", Filter = "JSON (*.json)|*.json",
                AddExtension = true, DefaultExt = ".json", FileName = "keo-revit-room-evidence.json", OverwritePrompt = false };
            if (target.ShowDialog() != true) return Result.Cancelled;
            if (!Path.IsPathFullyQualified(target.FileName) || File.Exists(target.FileName) ||
                !string.Equals(Path.GetExtension(target.FileName), ".json", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(Path.GetFullPath(target.FileName), Path.GetFullPath(doc.PathName), StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Output must be a new absolute .json file, never an existing file or the source RVT");

            // The original capture rechecks the source SHA, DocumentVersion and all Room phases.
            string hash;
            using (var file = new FileStream(doc.PathName, FileMode.Open, FileAccess.Read, FileShare.Read))
                hash = Convert.ToHexString(SHA256.HashData(file)).ToLowerInvariant();
            var request = new CaptureRequest(phase.UniqueId, selected.Select(r => r.UniqueId).ToArray(),
                hash, ui.Application.VersionBuild, sourceCommit, target.FileName);
            var snapshot = new Capture(ui, request).Read();
            // Raw profile only. Never set geometric/normative acceptance true on this basis.
            var bytes = JsonSerializer.SerializeToUtf8Bytes(snapshot, new JsonSerializerOptions { WriteIndented = true });
            if (bytes.Length > 5 * 1024 * 1024) throw new InvalidOperationException("Raw evidence > 5 MB, narrow the selection");
            using (var output = new FileStream(target.FileName, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                output.Write(bytes);
            TaskDialog.Show("КЕО для Revit — исследование",
                $"Сохранён сырой снимок {selected.Length} Room. Геометрия остекления, затенение и нормативный расчёт ещё НЕ подтверждены.\n{target.FileName}");
            return Result.Succeeded;
        }
        catch (Exception ex)
        {
            message = "Read-only KEO Room capture refused: " + ex.GetType().Name + ": " + ex.Message;
            return Result.Failed;
        }
    }
}

internal sealed record ParameterChoice(string Key, string Label);
internal sealed record ValueChoice(string Token, string Label);

// Use exact parameter IDs/Guids and typed values; visible labels are not identity.
internal static class RoomParameterFilter
{
    internal static string Key(Parameter p) => p.IsShared
        ? "shared:" + p.GUID.ToString("D")
        : "parameter-id:" + p.Id.Value.ToString(CultureInfo.InvariantCulture);

    internal static string? Token(Parameter p) => !p.HasValue ? null : p.StorageType switch
    {
        StorageType.Integer => "i:" + p.AsInteger().ToString(CultureInfo.InvariantCulture),
        StorageType.Double => "d:" + p.AsDouble().ToString("R", CultureInfo.InvariantCulture),
        StorageType.String => "s:" + (p.AsString() ?? ""),
        StorageType.ElementId => "e:" + p.AsElementId().Value.ToString(CultureInfo.InvariantCulture),
        _ => null
    };

    internal static string Display(Document doc, Parameter p)
    {
        var token = Token(p);
        if (token is null) return "<нет значения>";
        if (p.StorageType == StorageType.ElementId)
        {
            var name = doc.GetElement(p.AsElementId())?.Name;
            return name is null ? token : name + " [" + token + "]";
        }
        if (p.StorageType == StorageType.Integer && p.Definition?.GetDataType() == SpecTypeId.Boolean.YesNo)
            return p.AsInteger() == 1 ? "Да" : "Нет";
        return (p.AsValueString() is { Length: > 0 } text && p.StorageType != StorageType.String)
            ? text + " [" + token + "]" : token[2..];
    }

    internal static Parameter? Find(Room r, string key)
    {
        foreach (Parameter p in r.Parameters)
            if (Key(p) == key) return p;
        return null;
    }

    internal static Phase PhaseOf(Document doc, Room room)
    {
        var p = room.get_Parameter(BuiltInParameter.ROOM_PHASE_ID);
        if (p is null || p.StorageType != StorageType.ElementId ||
            doc.GetElement(p.AsElementId()) is not Phase phase)
            throw new NotSupportedException("ROOM_PHASE_ID unavailable for Room " + room.UniqueId);
        return phase;
    }
}

internal sealed class RoomFilterWindow : Window
{
    readonly Document doc;
    readonly Room[] allRooms;
    readonly ComboBox phaseBox = new() { Margin = new Thickness(0, 4, 0, 10) };
    readonly ComboBox parameterBox = new() { Margin = new Thickness(0, 4, 0, 10), DisplayMemberPath = "Label" };
    readonly ComboBox valueBox = new() { Margin = new Thickness(0, 4, 0, 10), DisplayMemberPath = "Label" };
    readonly TextBlock summary = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 6) };
    readonly ListBox roomList = new() { Height = 220 };
    Room[] matching = Array.Empty<Room>();

    internal Phase? SelectedPhase => phaseBox.SelectedItem as Phase;
    internal Room[] SelectedRooms => matching;

    internal RoomFilterWindow(Document doc, Room[] rooms, Phase[] phases)
    {
        this.doc = doc;
        allRooms = rooms;
        Title = "КЕО для Revit — отбор настоящих Rooms (read-only)";
        Width = 660; Height = 650; MinWidth = 520; WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var content = new StackPanel { Margin = new Thickness(18) };
        Content = content;
        content.Children.Add(new TextBlock { Text = "Фаза Revit", FontWeight = FontWeights.SemiBold });
        phaseBox.ItemsSource = phases;
        phaseBox.DisplayMemberPath = "Name";
        content.Children.Add(phaseBox);
        content.Children.Add(new TextBlock { Text = "Параметр Room (точный ID/GUID, не только имя)", FontWeight = FontWeights.SemiBold });
        content.Children.Add(parameterBox);
        content.Children.Add(new TextBlock { Text = "Значение параметра (точное совпадение)", FontWeight = FontWeights.SemiBold });
        content.Children.Add(valueBox);
        content.Children.Add(summary);
        content.Children.Add(roomList);
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 12, 0, 0) };
        var cancel = new Button { Content = "Отмена", MinWidth = 90, Margin = new Thickness(6, 0, 0, 0) };
        cancel.Click += (_, _) => { DialogResult = false; };
        var capture = new Button { Content = "Снять данные выбранных Rooms…", MinWidth = 210,
            Margin = new Thickness(6, 0, 0, 0) };
        capture.Click += (_, _) => { if (matching.Length is > 0 and <= 256) DialogResult = true; };
        buttons.Children.Add(cancel); buttons.Children.Add(capture);
        content.Children.Add(buttons);

        phaseBox.SelectionChanged += (_, _) => LoadParameters();
        parameterBox.SelectionChanged += (_, _) => LoadValues();
        valueBox.SelectionChanged += (_, _) => Refresh();
        phaseBox.SelectedIndex = 0; // Only selects UI context; all phases are visible and explicit.
    }

    Room[] InPhase() => SelectedPhase is null ? Array.Empty<Room>() :
        allRooms.Where(r => RoomParameterFilter.PhaseOf(doc, r).Id == SelectedPhase.Id).ToArray();

    void LoadParameters()
    {
        var seen = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var room in InPhase())
            foreach (Parameter p in room.Parameters)
            {
                if (p.StorageType == StorageType.None) continue;
                var key = RoomParameterFilter.Key(p);
                if (!seen.ContainsKey(key)) seen.Add(key, p.Definition?.Name ?? "[параметр без имени]");
            }
        parameterBox.ItemsSource = seen.OrderBy(v => v.Value, StringComparer.CurrentCulture)
            .ThenBy(v => v.Key, StringComparer.Ordinal)
            .Select(v => new ParameterChoice(v.Key, v.Value + " (" + v.Key + ")")).ToArray();
        parameterBox.SelectedIndex = seen.Count > 0 ? 0 : -1;
        Refresh();
    }

    void LoadValues()
    {
        if (parameterBox.SelectedItem is not ParameterChoice p)
        { valueBox.ItemsSource = Array.Empty<ValueChoice>(); Refresh(); return; }
        var options = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var room in InPhase())
        {
            var param = RoomParameterFilter.Find(room, p.Key);
            var token = param is null ? null : RoomParameterFilter.Token(param);
            var key = token ?? "<missing>";
            if (!options.ContainsKey(key)) options.Add(key, param is null ? "<параметр отсутствует>" : RoomParameterFilter.Display(doc, param));
        }
        valueBox.ItemsSource = options.OrderBy(x => x.Value, StringComparer.CurrentCulture)
            .Select(x => new ValueChoice(x.Key, x.Value + " (" + x.Key + ")")).ToArray();
        valueBox.SelectedIndex = options.Count > 0 ? 0 : -1;
        Refresh();
    }

    void Refresh()
    {
        var key = (parameterBox.SelectedItem as ParameterChoice)?.Key;
        var token = (valueBox.SelectedItem as ValueChoice)?.Token;
        matching = key is null || token is null ? Array.Empty<Room>() : InPhase().Where(r =>
        {
            var p = RoomParameterFilter.Find(r, key);
            return (p is null ? "<missing>" : RoomParameterFilter.Token(p) ?? "<missing>") == token;
        }).ToArray();
        summary.Text = $"Найдено {matching.Length} Room. Предел первого экспериментального экспорта: 1–256, одна фаза. " +
            "Будут выданы только сырые данные, без нормативного заключения.";
        roomList.ItemsSource = matching.Take(150).Select(r =>
            r.Number + " — " + r.Name + " | UID: " + r.UniqueId).ToArray();
    }
}
