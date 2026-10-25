# Pushbullet

## Überblick

Diese Integration sendet die Benachrichtigungen von Gladys als
[Pushbullet](https://www.pushbullet.com)-Pushes an die Telefone, Computer und
Browser, auf denen Pushbullet installiert ist. Jeder Gladys-Benutzer gibt die
E-Mail seines Pushbullet-Kontos ein; der Administrator gibt einmal für das Haus
das Zugriffstoken eines Pushbullet-Kontos ein. Ein von Gladys angehängtes
Kamerabild kommt als Bild an.

Außerdem bietet sie:

- drei **Szenen-Auslöser**: Push empfangen, Telefon-Benachrichtigung (eine von
  Pushbullet gespiegelte Android-Benachrichtigung), Push nicht gesendet;
- zwei **Szenen-Aktionen**: einen Pushbullet-Push senden (Notiz oder Link, an
  jedes Ziel), eine SMS über ein Android-Telefon senden;
- zwei **Dashboard-Widgets**: das Konto und die empfangenen Pushes.

![Die beiden Widgets der Integration: das Pushbullet-Konto mit seinen Pushes des Monats und die zuletzt empfangenen Pushes und Benachrichtigungen (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-pushbullet/main/docs/assets/widgets.de.png)

Transport: **Cloud**. Die Texte der Benachrichtigungen, die empfangenen Pushes
und, wenn aktiviert, die gespiegelten Benachrichtigungen laufen über die
Server von Pushbullet (`api.pushbullet.com`, `stream.pushbullet.com`).

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer.
- Ein Pushbullet-Konto und die Pushbullet-App auf den Geräten, die die
  Benachrichtigungen erhalten sollen (Android, iPhone, Windows,
  Browser-Erweiterungen).
- Ein Gratiskonto sendet **500 Pushes pro Monat**, alle Apps und Dienste
  zusammen; Pushbullet Pro hebt das Limit auf. Gratiskonten haben auch ein
  monatliches SMS-Limit.
- Optional: ein **Android**-Telefon mit der Pushbullet-App, um SMS zu senden
  und seine Benachrichtigungen zu spiegeln.

## Konfiguration

1. Öffnen Sie auf [pushbullet.com](https://www.pushbullet.com/#settings/account)
   **Settings → Account** und klicken Sie auf **Create Access Token**. Das
   Token beginnt mit `o.`.
2. Öffnen Sie in Gladys **Integrationen → Pushbullet → Konfiguration**, fügen
   Sie das Token ein und speichern Sie.
3. Klicken Sie auf **Verbindung testen**: Das Konto, seine Geräte und die
   Telefone, die SMS senden können, werden angezeigt. **Test-Push senden**
   prüft die ganze Kette.
4. Jeder Benutzer öffnet den Block **Mein Konto** desselben Bildschirms und
   gibt die **E-Mail seines Pushbullet-Kontos** ein (und optional eines seiner
   Geräte).

| Feld                                      | Zweck                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Zugriffstoken                             | Aus Pushbullet → Settings → Account, verschlüsselt gespeichert                            |
| Titel der Benachrichtigungen              | Über jeder Nachricht von Gladys angezeigt (standardmäßig `Gladys`)                        |
| Sprache des Test-Pushs                    | Die Sprache des Test-Pushs (standardmäßig Englisch)                                       |
| Gerät „Gladys“ hinzufügen                 | Fügt dem Konto ein Gerät namens „Gladys“ hinzu (standardmäßig an)                         |
| Name des Geräts                           | Wird beim Anlegen des Geräts verwendet (standardmäßig `Gladys`)                           |
| Empfangene Pushes                         | Löst „Push empfangen“ für jeden neuen Push aus (standardmäßig an)                         |
| Gespiegelte Benachrichtigungen            | Löst „Telefon-Benachrichtigung“ für jede Android-Benachrichtigung aus (standardmäßig aus) |
| Passwort der Ende-zu-Ende-Verschlüsselung | Nur bei aktivierter Verschlüsselung in den Pushbullet-Apps: dasselbe Passwort             |
| Mein Konto → E-Mail                       | Pro Benutzer: das Pushbullet-Konto seiner Benachrichtigungen                              |
| Mein Konto → Gerät                        | Pro Benutzer, optional: ein Gerät, nur wenn die E-Mail die des Gladys-Kontos ist          |

Das Token gewährt vollen Zugriff auf das Pushbullet-Konto. Die Integration
sendet nur Pushes und SMS, liest die empfangenen Pushes und fügt das Gerät
„Gladys“ hinzu.

## Verwendung

### Benachrichtigungen

Jede Gladys-Benachrichtigung an einen Benutzer, der eine E-Mail eingegeben
hat, geht als Push hinaus: Alarme, Szenen-Aktionen „Nachricht senden“,
Antworten von Gladys.

- Ist die E-Mail die des Kontos des Tokens, geht der Push an alle seine
  Geräte oder an das Gerät aus dem Block „Mein Konto“.
- Eine andere E-Mail: Der Push geht an diesen Pushbullet-Benutzer; hat die
  Adresse kein Pushbullet-Konto, sendet Pushbullet stattdessen eine E-Mail.
- Ein an die Nachricht angehängtes Bild (Szenen-Aktion „Kamerabild senden“)
  wird hochgeladen und kommt als Bild an.

### Das Gerät „Gladys“

Die Integration fügt dem Konto ein Gerät namens **Gladys** hinzu. Senden Sie
ihm einen Push (über das Teilen-Menü Ihres Telefons oder aus der
Pushbullet-App), um mit Ihren Szenen zu sprechen, ohne Ihre anderen Geräte zu
stören. Die Pushes von Gladys zeigen es als Herkunft an. Das Ausschalten der
Option löscht es nicht: Entfernen Sie es in Pushbullet. Zum Umbenennen
benennen Sie es in Pushbullet um.

### Szenen-Auslöser

| Auslöser                 | Wann er auslöst                                                                                            | Variablen                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Push empfangen           | Jeder neue Push auf dem Konto, außer denen von Gladys; Filter: Ziel, Herkunft, erstes Wort, Absender, Art  | Titel, Text, Link, Dateiname, erstes Wort, Art, Herkunft, Ziel, Absender, Gerät, Datum |
| Telefon-Benachrichtigung | Jede von einem Android-Telefon gespiegelte Benachrichtigung; Filter: App, Telefon, erstes Wort             | App, Paket, Titel, Text, erstes Wort, Telefon, Datum                                   |
| Push nicht gesendet      | Der erste Fehler einer Benachrichtigung, danach erst wieder nach einem erfolgreichen Push (keine Schleife) | Grund, HTTP-Status, Fehler, maskierte E-Mail                                           |

Das erste Wort steht in Großbuchstaben ohne Akzente: Ein Push mit dem Titel
„Garage offen“ ergibt `GARAGE`. Ein Push, der nach einer Unterbrechung älter
als 15 Minuten gefunden wird, löst nie aus, und die beim Start des Empfangs
bereits vorhandenen Pushes werden ignoriert.

**Ein anderer Pushbullet-Benutzer kann an Ihre E-Mail pushen**: Filtern Sie
vor dem Öffnen einer Tür oder dem Entschärfen einer Alarmanlage nach der
Herkunft „Eines meiner Geräte“ oder nach Ihrer eigenen Absender-E-Mail.

### Szenen-Aktionen

- **Pushbullet-Push senden**: ein Titel, ein Text und optional ein Link; an
  alle Geräte des Kontos, ein Gerät (nach Name), eine andere Person (nach
  E-Mail) oder einen eigenen Kanal. Gibt die Push-Kennung und das Ziel zurück.
- **SMS über Pushbullet senden**: eine oder mehrere Nummern und ein Text. Ihr
  Android-Telefon sendet sie mit seinem eigenen Tarif, sobald es
  synchronisiert; Pushbullet verwirft sie nach einer Stunde. Gibt die
  SMS-Kennung und das Telefon zurück.

### Szenen-Beispiele

- _Wenn ein Push, der mit GARAGE beginnt, von einem meiner Geräte am Gerät
  „Gladys“ ankommt_ → das Garagentor schließen.
- _Wenn das Telefon eine Benachrichtigung der Liefer-App zeigt_ → das Licht am
  Eingang einschalten.
- _Wenn die Alarmanlage auslöst_ → einen Push mit einem Link zum
  Kamera-Dashboard senden und eine SMS an den Nachbarn.

### Dashboard-Widgets

- **Pushbullet**: die diesen Monat von Gladys gesendeten Pushes (orange ab
  400, rot ab 500, dem Gratis-Limit), die empfangenen Pushes und
  Benachrichtigungen, die Geräte, der Zustand des Kontos und der
  Echtzeitverbindung, das Gerät „Gladys“, die SMS des Monats, der letzte
  Fehler und eine Schaltfläche **Test senden**.
- **Empfangene Pushes**: die letzten Pushes und Telefon-Benachrichtigungen;
  antippen, um sie ganz zu lesen.

## Fehlerbehebung

- **„Pushbullet lehnt das Zugriffstoken ab“**: Das Token wurde falsch
  eingegeben oder widerrufen (Pushbullet → Settings → Account). Erstellen Sie
  ein neues und fügen Sie es ein.
- **„Monatliches Push-Limit erreicht“**: Das Gratiskonto hat diesen Monat 500
  Pushes gesendet (alle Apps zusammen). Warten Sie auf den nächsten Monat oder
  nehmen Sie Pushbullet Pro.
- **„Unbekanntes Gerät, E-Mail oder Kanal“**: Prüfen Sie den Namen des Geräts
  in Pushbullet („Verbindung testen“ listet sie auf). Ein Gerät kann nur
  gewählt werden, wenn die E-Mail die des Kontos des Tokens ist.
- **Nichts empfangen**: Prüfen Sie, dass „Empfangene Pushes“ an ist und die
  Zeile „Echtzeit“ des Widgets „empfangsbereit“ anzeigt. Von Gladys gesendete
  Pushes lösen nie etwas aus.
- **Keine Telefon-Benachrichtigung**: Aktivieren Sie die
  Benachrichtigungsspiegelung in der Pushbullet-App des Telefons und
  „Gespiegelte Benachrichtigungen“ in der Konfiguration. Bei
  Ende-zu-Ende-Verschlüsselung geben Sie dasselbe Passwort ein.
- **SMS nicht gesendet**: Das Telefon muss eingeschaltet und online sein und
  Pushbullet im Hintergrund laufen lassen.
- **Protokolle**: Integrationen → Pushbullet → Reiter Überwachung.
  E-Mail-Adressen sind maskiert; das Token erscheint nie.
