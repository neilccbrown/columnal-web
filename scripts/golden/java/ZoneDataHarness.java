// Extracts the time-zone data that java.time's parsers use in the en-US locale, so the port can
// parse zones exactly as Java does:
//   id <zone id>                    every ID from ZoneRulesProvider.getAvailableZoneIds()
//   short <text> <zone id>          appendZoneText(TextStyle.SHORT) parses <text> fully as <zone id>
// Candidate texts are every zone display name Java knows; each is run through Java's real parser.
// Run by scripts/golden/zone-data.sh.
import java.text.DateFormatSymbols;
import java.text.ParsePosition;
import java.time.*;
import java.time.format.*;
import java.time.temporal.TemporalQueries;
import java.time.zone.ZoneRulesProvider;
import java.util.*;

public class ZoneDataHarness
{
    public static void main(String[] args)
    {
        Locale locale = Locale.US;
        TreeSet<String> ids = new TreeSet<>(ZoneRulesProvider.getAvailableZoneIds());
        for (String id : ids)
            System.out.println("id " + id);

        TreeSet<String> candidates = new TreeSet<>(ids);
        for (String[] names : DateFormatSymbols.getInstance(locale).getZoneStrings())
            candidates.addAll(Arrays.asList(names));
        for (String id : ids)
        {
            for (TextStyle style : TextStyle.values())
                candidates.add(ZoneId.of(id).getDisplayName(style, locale));
            TimeZone tz = TimeZone.getTimeZone(id);
            for (boolean daylight : new boolean[] {false, true})
                for (int style : new int[] {TimeZone.SHORT, TimeZone.LONG})
                    candidates.add(tz.getDisplayName(daylight, style, locale));
        }

        DateTimeFormatter shortText = new DateTimeFormatterBuilder().appendZoneText(TextStyle.SHORT).toFormatter(locale);
        for (String c : candidates)
        {
            if (c == null || c.isEmpty() || c.indexOf(' ') >= 0 && c.length() > 40)
                continue;
            ParsePosition pos = new ParsePosition(0);
            var parsed = shortText.parseUnresolved(c, pos);
            if (parsed == null || pos.getErrorIndex() >= 0 || pos.getIndex() != c.length())
                continue;
            ZoneId zone = parsed.query(TemporalQueries.zoneId());
            // IDs and offset-style texts are handled by the parser's own logic, not the table:
            if (zone != null && !c.equals(zone.getId()))
                System.out.println("short " + c.replace(" ", "\\u0020") + " " + zone.getId());
        }
    }
}
