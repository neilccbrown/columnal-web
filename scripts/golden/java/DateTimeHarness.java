// Golden values for Columnal's date/time formatters: DataType.DateTimeInfo is extracted from the
// ORIGINAL DataType.java by scripts/golden/datetime.sh and pasted in at "DATETIMEINFO" below.
package golden;

import java.time.*;
import java.time.format.*;
import java.time.temporal.*;
import static java.time.temporal.ChronoField.*;
import static golden.DataType.DateTimeInfo.F.*;
import java.util.*;
import java.util.function.*;
import com.google.common.collect.ImmutableList;

public class DateTimeHarness
{
    static String esc(String s)
    {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray())
            b.append(c >= 0x20 && c < 0x7f && c != '"' && c != '\\' ? String.valueOf(c) : String.format("\\u%04x", (int) c));
        return b.append('"').toString();
    }

    // DataTypeUtility.value(DateTimeInfo, TemporalAccessor), which DateTimeInfo.fromParsed uses
    static TemporalAccessor value(DataType.DateTimeInfo.DateTimeType type, TemporalAccessor t)
    {
        switch (type)
        {
            case YEARMONTHDAY: return t instanceof LocalDate ? t : LocalDate.from(t);
            case YEARMONTH: return t instanceof YearMonth ? t : YearMonth.from(t);
            case TIMEOFDAY: return t instanceof LocalTime ? t : LocalTime.from(t);
            case DATETIME: return t instanceof LocalDateTime ? t : t instanceof LocalDate ? LocalDateTime.of((LocalDate) t, LocalTime.MIN) : LocalDateTime.from(t);
            default: return t instanceof ZonedDateTime ? t : ZonedDateTime.from(t);
        }
    }

    static String parseResult(DataType.DateTimeInfo.DateTimeType type, DateTimeFormatter f, String s)
    {
        try
        {
            return value(type, f.parse(s)).toString();
        }
        catch (DateTimeException e)
        {
            return "ERR " + e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }

    public static void main(String[] args)
    {
        Random r = new Random(5678);
        List<ZoneId> zones = new ArrayList<>();
        for (String z : List.of("UTC", "Z", "+05:30", "-08:00", "Europe/London", "America/New_York", "Asia/Kolkata", "Australia/Lord_Howe", "Pacific/Chatham", "America/Sao_Paulo", "Africa/Casablanca", "GMT", "Etc/GMT+5", "UTC+01:00", "GMT-03:30", "UT"))
            zones.add(ZoneId.of(z));

        Map<DataType.DateTimeInfo.DateTimeType, List<TemporalAccessor>> values = new LinkedHashMap<>();
        for (DataType.DateTimeInfo.DateTimeType t : DataType.DateTimeInfo.DateTimeType.values())
            values.put(t, new ArrayList<>());
        for (int i = 0; i < 60; i++)
        {
            int year = switch (r.nextInt(6)) { case 0 -> 1 + r.nextInt(9999); case 1 -> r.nextInt(3) == 0 ? -r.nextInt(5000) : 10000 + r.nextInt(900000); default -> 1900 + r.nextInt(151); };
            LocalDate date = LocalDate.of(year, 1, 1).plusDays(r.nextInt(366)).withYear(year);
            LocalTime time = LocalTime.ofNanoOfDay(switch (r.nextInt(4)) { case 0 -> (long) r.nextInt(24 * 60) * 60_000_000_000L; case 1 -> (long) r.nextInt(86400) * 1_000_000_000L; case 2 -> (long) r.nextInt(86_400_000) * 1_000_000L; default -> (r.nextLong() & Long.MAX_VALUE) % 86_400_000_000_000L; });
            values.get(DataType.DateTimeInfo.DateTimeType.YEARMONTHDAY).add(date);
            values.get(DataType.DateTimeInfo.DateTimeType.YEARMONTH).add(YearMonth.from(date));
            values.get(DataType.DateTimeInfo.DateTimeType.TIMEOFDAY).add(time);
            values.get(DataType.DateTimeInfo.DateTimeType.DATETIME).add(LocalDateTime.of(date, time));
            // Zoned values are kept to 1900-2050: beyond the range the tz database tabulates (e.g.
            // Morocco's rules end in 2087), the JDK and js-joda extrapolate zone offsets differently.
            if (year >= 1900 && year <= 2050)
                values.get(DataType.DateTimeInfo.DateTimeType.DATETIMEZONED).add(ZonedDateTime.of(LocalDateTime.of(date, time), zones.get(r.nextInt(zones.size()))));
        }
        // DST gaps and overlaps:
        for (String ldt : List.of("2021-03-28T01:30", "2021-10-31T01:30", "2021-03-14T02:30", "2021-11-07T01:30"))
            for (ZoneId z : zones)
                values.get(DataType.DateTimeInfo.DateTimeType.DATETIMEZONED).add(ZonedDateTime.of(LocalDateTime.parse(ldt), z));

        for (var e : values.entrySet())
        {
            DateTimeFormatter f = new DataType.DateTimeInfo(e.getKey()).getStrictFormatter();
            for (TemporalAccessor v : e.getValue())
                System.out.println("format " + e.getKey() + " " + esc(v.toString()) + " = " + esc(f.format(v)));
        }

        Map<DataType.DateTimeInfo.DateTimeType, List<String>> strict = Map.of(
            DataType.DateTimeInfo.DateTimeType.YEARMONTHDAY, List.of("2020-01-05", "2020-1-5", "2020-02-30", "2020-02-29", "2021-02-29", "0000-01-01", "-0001-01-01", "+10000-01-01", "10000-01-01", "2020-13-01", "2020-00-10", " 2020-01-01", "2020-01-01 ", "20-01-01", "2020/01/01", "2020-04-31", "+2020-01-01", "02020-01-01"),
            DataType.DateTimeInfo.DateTimeType.YEARMONTH, List.of("2020-01", "2020-1", "2020-13", "+10000-01", "10000-01", "-0005-12", "2020-01-01"),
            DataType.DateTimeInfo.DateTimeType.TIMEOFDAY, List.of("10:15", "10:15:30", "10:15:30.5", "10:15:30.123456789", "10:15:30.1234567891", "24:00", "23:59:60", "9:15", "10:15:", "10:15:30.", "1:2", "00:00", "23:59:59.999999999", "10:60"),
            DataType.DateTimeInfo.DateTimeType.DATETIME, List.of("2020-01-01 10:15", "2020-01-01T10:15", "2020-01-01 24:00", "2020-01-01  10:15", "2020-02-30 10:15:30.5", "2020-01-01 10:15:30.000"),
            DataType.DateTimeInfo.DateTimeType.DATETIMEZONED, List.of("2020-01-01 10:15 Europe/London", "2020-01-01 10:15 UTC", "2020-01-01 10:15 Z", "2020-01-01 10:15 +05:30", "2020-01-01 10:15 GMT+1", "2020-01-01 10:15 UTC+01:00", "2020-01-01 10:15 europe/london", "2020-01-01 10:15 EST", "2021-03-28 01:30 Europe/London", "2021-10-31 01:30 Europe/London", "2020-01-01 10:15 Nowhere/Place", "2020-01-01 10:15 Etc/GMT+5", "2020-01-01 10:15 +05", "2020-01-01 10:15 -0800", "2020-01-01 10:15Europe/London", "2020-01-01 10:15 GMT", "2020-01-01 10:15 UT", "2020-01-01 10:15 +5:30", "2020-01-01 10:15 America/Argentina/Buenos_Aires", "2020-01-01 10:15 US/Eastern")
        );
        for (DataType.DateTimeInfo.DateTimeType t : DataType.DateTimeInfo.DateTimeType.values())
            for (String s : strict.get(t))
                System.out.println("strict " + t + " " + esc(s) + " = " + esc(parseResult(t, new DataType.DateTimeInfo(t).getStrictFormatter(), s)));

        List<String> dates = List.of("1 Jan 2020", "01 jan 2020", "1 January 2020", "Jan 1 2020", "January 1 2020", "2020 Jan 1", "2020 01 05", "05 01 2020", "13 01 2020", "01 13 2020", "5 1 20", "31 12 99", "1 Jan 20", "Sept 1 2020", "1 Sep 2020", "1 sept 2020", "29 Feb 2021", "31 Apr 2020", "1 Janu 2020", "1 MAY 2020", "12 05 60", "3 4 39", "1 1 2020", "2020 1 1", "Feb 30 2020");
        List<String> times = List.of("10:15", "10:15:30", "10:15:30.123", "10:15 PM", "10:15PM", "10:15 pm", "12:00 AM", "0:15 AM", "13:15 PM", "10:15:30.5 am", "7:05", "24:00", "12:30 PM", "1:5", "10:15 P.M.");
        List<String> yms = List.of("01 2020", "1 2020", "Jan 20", "Jan 2020", "January 2020", "2020 01", "13 2020", "Sept 2020", "Sep 2020", "jan 1999", "2020 1");
        List<String> zoneSuffixes = List.of(" Europe/London", " UTC", " Z", " EST", " PST", " GMT", " BST", " CET", " CEST", " +01:00[Europe/Paris]", "+05:30[Asia/Kolkata]", " IST", "Europe/London", " America/New_York", " JST", " AEST", " Pacific Standard Time", " MSK", " EDT");
        Map<DataType.DateTimeInfo.DateTimeType, List<String>> flex = new LinkedHashMap<>();
        flex.put(DataType.DateTimeInfo.DateTimeType.YEARMONTHDAY, dates);
        flex.put(DataType.DateTimeInfo.DateTimeType.YEARMONTH, yms);
        flex.put(DataType.DateTimeInfo.DateTimeType.TIMEOFDAY, times);
        List<String> dateTimes = new ArrayList<>();
        for (int i = 0; i < 40; i++)
            dateTimes.add(dates.get(r.nextInt(dates.size())) + (r.nextInt(4) == 0 ? "T" : " ") + times.get(r.nextInt(times.size())));
        flex.put(DataType.DateTimeInfo.DateTimeType.DATETIME, dateTimes);
        List<String> zoned = new ArrayList<>();
        for (int i = 0; i < 40; i++)
            zoned.add(dates.get(r.nextInt(5)) + " " + times.get(r.nextInt(4)) + zoneSuffixes.get(r.nextInt(zoneSuffixes.size())));
        for (String z : zoneSuffixes)
            zoned.add("1 Jan 2020 10:15" + z);
        flex.put(DataType.DateTimeInfo.DateTimeType.DATETIMEZONED, zoned);

        for (var e : flex.entrySet())
        {
            var formatters = new DataType.DateTimeInfo(e.getKey()).getFlexibleFormatters();
            for (String s : e.getValue())
            {
                StringBuilder b = new StringBuilder();
                for (int g = 0; g < formatters.size(); g++)
                    for (int i = 0; i < formatters.get(g).size(); i++)
                    {
                        String res = parseResult(e.getKey(), formatters.get(g).get(i), s);
                        if (!res.startsWith("ERR"))
                            b.append(" ").append(g).append(".").append(i).append(":").append(res);
                    }
                System.out.println("flex " + e.getKey() + " " + esc(s) + " =" + b);
            }
        }
    }
}

// Stand-ins for what the extracted code uses (the launcher needs the main class first):
class InternalException extends Exception { InternalException(String m) { super(m); } }

class Utility
{
    //UTILITY
}

class DataType
{
    //DATETIMEINFO
}
