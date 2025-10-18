import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
	component: FAQPage,
});

function FAQPage() {
	return (
		<div className="mx-auto max-w-4xl space-y-6">
			<div>
				<h1 className="text-3xl font-semibold">Häufig gestellte Fragen</h1>
                                <p className="mt-2 text-muted-foreground">
                                        Hier findest du Antworten auf die wichtigsten Fragen zur Nutzung von
                                        Tendera.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Erste Schritte</CardTitle>
					<CardDescription>
						Grundlegende Informationen zur Nutzung der Plattform
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible className="w-full">
                                                <AccordionItem value="what-is-tendera">
                                                        <AccordionTrigger>Was ist Tendera?</AccordionTrigger>
                                                        <AccordionContent>
                                                                Tendera ist eine Plattform zur automatischen Analyse von
								Ausschreibungen und Vergabeunterlagen. Du kannst zwei Arten von
								Projekten erstellen: Standard-Analysen für einzelne Dokumente und
								Offerten-Vergleiche für mehrere Angebote.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="create-project">
							<AccordionTrigger>
								Wie erstelle ich ein neues Projekt?
							</AccordionTrigger>
							<AccordionContent>
								Gehe zu „Projekte" und klicke auf „Neues Projekt". Wähle einen
								Namen, den Kunden und den Projekt-Typ (Standard-Analyse oder
								Offerten-Vergleich). Bei Standard-Analysen kannst du optional einen
								Kriterienkatalog auswählen.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="project-types">
							<AccordionTrigger>
								Was ist der Unterschied zwischen Standard-Analyse und
								Offerten-Vergleich?
							</AccordionTrigger>
							<AccordionContent>
								<strong>Standard-Analyse:</strong> Analysiere ein einzelnes
								Dokument nach vordefinierten Kriterien aus einem Kriterienkatalog. Ideal
								für die strukturierte Auswertung von Ausschreibungen.
								<br />
								<br />
								<strong>Offerten-Vergleich:</strong> Vergleiche mehrere Angebote
								verschiedener Anbieter gegen ein Pflichtenheft. Die KI extrahiert
								automatisch Muss- und Kann-Kriterien und prüft jedes Angebot
								darauf.
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Standard-Analyse</CardTitle>
					<CardDescription>
						Ein einzelnes Dokument nach vordefinierten Kriterien analysieren
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="standard-template">
							<AccordionTrigger>
								Was ist ein Kriterienkatalog und wofür brauche ich ihn?
							</AccordionTrigger>
							<AccordionContent>
								Ein Kriterienkatalog ist eine Sammlung von Fragen, die automatisch von der
								KI beantwortet werden. Du kannst Kriterienkataloge für wiederkehrende
								Analysen erstellen (z.B. immer die gleichen Kriterien für alle
								IT-Ausschreibungen). Im Projekt wählst du dann einfach den
								passenden Kriterienkatalog aus.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="standard-upload">
							<AccordionTrigger>
								Wie lade ich ein Dokument für die Standard-Analyse hoch?
							</AccordionTrigger>
							<AccordionContent>
								Öffne das Projekt und gehe zu „Dokumente". Ziehe deine Datei
								(PDF, DOCX oder TXT) in die Upload-Zone oder klicke darauf, um
								eine Datei auszuwählen. Die Texterkennung läuft automatisch im
								Hintergrund.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="standard-analyze">
							<AccordionTrigger>Wie starte ich die Analyse?</AccordionTrigger>
							<AccordionContent>
								Gehe im Projekt zu „Standard-Analyse" und klicke auf „Analyse
								starten". Die KI durchsucht das Dokument und beantwortet alle
								Fragen aus dem Kriterienkatalog. Nach Abschluss siehst du die Ergebnisse
								mit Zitaten aus dem Dokument.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="standard-results">
							<AccordionTrigger>
								Wie interpretiere ich die Analyse-Ergebnisse?
							</AccordionTrigger>
							<AccordionContent>
								Jede Frage zeigt die Antwort der KI mit Zitaten und Seitenzahlen
								aus dem Dokument. Du kannst die Antworten exportieren oder
								manuell anpassen. Zitate ermöglichen es dir, die Quelle der
								Antwort im Originaldokument nachzuvollziehen.
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Offerten-Vergleich</CardTitle>
					<CardDescription>
						Mehrere Angebote gegen ein Pflichtenheft vergleichen
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="offerten-workflow">
							<AccordionTrigger>
								Wie funktioniert der Offerten-Vergleich?
							</AccordionTrigger>
							<AccordionContent>
								Der Offerten-Vergleich läuft in drei Schritten:
								<ol className="mt-2 list-decimal space-y-1 pl-5">
									<li>
										<strong>Pflichtenheft hochladen:</strong> Lade das Dokument
										mit den Anforderungen hoch.
									</li>
									<li>
										<strong>Kriterien extrahieren:</strong> Die KI erkennt
										automatisch Muss- und Kann-Kriterien.
									</li>
									<li>
										<strong>Angebote vergleichen:</strong> Füge Angebote hinzu
										und lass sie automatisch prüfen.
									</li>
								</ol>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="offerten-setup">
							<AccordionTrigger>
								Wie richte ich ein Offerten-Projekt ein?
							</AccordionTrigger>
							<AccordionContent>
								Nach dem Erstellen des Projekts öffne „Offerten-Vergleich" und
								klicke auf „Setup öffnen". Lade zuerst das Pflichtenheft hoch
								(PDF, DOCX oder TXT). Sobald die Verarbeitung abgeschlossen ist,
								klicke auf „Kriterien extrahieren". Die KI erstellt automatisch
								einen Kriterienkatalog mit allen gefundenen Muss- und Kann-Kriterien.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="offerten-add">
							<AccordionTrigger>Wie füge ich Angebote hinzu?</AccordionTrigger>
							<AccordionContent>
								Nachdem die Kriterien extrahiert wurden, klicke auf „Neues
								Angebot" und gib den Anbieternamen ein. Gehe dann zu „Dokumente"
								und lade das Angebots-Dokument hoch. In der Offerten-Übersicht
								kannst du dann „Prüfung starten" klicken.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="offerten-check">
							<AccordionTrigger>
								Wie wird ein Angebot geprüft?
							</AccordionTrigger>
							<AccordionContent>
								Klicke bei einem Angebot auf „Prüfung starten". Die KI prüft
								systematisch jedes Kriterium und markiert es als erfüllt (✓),
								nicht erfüllt (✗), teilweise erfüllt (~) oder unklar (?). Für
								jedes Kriterium werden relevante Zitate aus dem Angebotsdokument
								gespeichert.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="offerten-erfuellungsgrad">
							<AccordionTrigger>
								Was bedeutet der Erfüllungsgrad?
							</AccordionTrigger>
							<AccordionContent>
								Der Erfüllungsgrad zeigt, wie gut ein Angebot die Anforderungen
								erfüllt. Er wird berechnet aus:
								<ul className="mt-2 list-disc space-y-1 pl-5">
									<li>
										<strong>Muss-Kriterien:</strong> Gewicht 100 (sehr wichtig)
									</li>
									<li>
										<strong>Kann-Kriterien:</strong> Gewicht 50 (nice to have)
									</li>
								</ul>
								Erfüllte Kriterien zählen voll, teilweise erfüllte zur Hälfte.
								Der Erfüllungsgrad ist die erreichte Punktzahl geteilt durch die
								Maximalpunktzahl (in Prozent).
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="offerten-matrix">
							<AccordionTrigger>
								Wie nutze ich die Vergleichsmatrix?
							</AccordionTrigger>
							<AccordionContent>
								Die Vergleichsmatrix zeigt alle Kriterien in den Zeilen und alle
								Angebote in den Spalten. Muss-Kriterien stehen oben und sind rot
								markiert. So siehst du auf einen Blick, welches Angebot welche
								Anforderungen erfüllt. Klicke auf „Details ansehen" für eine
								ausführliche Ansicht mit Zitaten.
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Kriterienkataloge</CardTitle>
					<CardDescription>
						Fragenkataloge erstellen und wiederverwenden
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="template-create">
							<AccordionTrigger>
								Wie erstelle ich einen Kriterienkatalog?
							</AccordionTrigger>
							<AccordionContent>
								Gehe zu „Kriterienkataloge" und klicke auf „Neuer Katalog". Gib einen
								Namen ein und füge Fragen hinzu. Jede Frage kann vom Typ
								„Ja/Nein", „Text" oder „Zahl" sein. Kriterienkataloge kannst du in
								mehreren Standard-Analyse-Projekten wiederverwenden.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="template-auto">
							<AccordionTrigger>
								Kann ich Kriterienkataloge automatisch erstellen lassen?
							</AccordionTrigger>
							<AccordionContent>
								Ja! Im Offerten-Vergleich werden Kriterienkataloge automatisch erstellt,
								wenn du „Kriterien extrahieren" aus dem Pflichtenheft ausführst.
								Die KI erkennt Muss- und Kann-Kriterien und erstellt daraus einen
								vollständigen Kriterienkatalog.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="template-edit">
							<AccordionTrigger>
								Kann ich Kriterienkataloge nachträglich bearbeiten?
							</AccordionTrigger>
							<AccordionContent>
								Ja, du kannst Kriterienkataloge jederzeit öffnen, Fragen hinzufügen,
								bearbeiten oder löschen. Änderungen wirken sich auf zukünftige
								Analysen aus, bereits durchgeführte Analysen bleiben unverändert.
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Dokumente</CardTitle>
					<CardDescription>
						Mit Dokumenten arbeiten und Texte extrahieren
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="doc-formats">
							<AccordionTrigger>
								Welche Dateiformate werden unterstützt?
							</AccordionTrigger>
							<AccordionContent>
                                                                Tendera unterstützt PDF, DOCX (Word) und TXT-Dateien. Die
								Texterkennung läuft automatisch nach dem Upload. Bei PDF-Dateien
								funktioniert OCR (Texterkennung aus Bildern) möglicherweise nur
								eingeschränkt – am besten funktionieren PDFs mit selektierbarem
								Text.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="doc-size">
							<AccordionTrigger>
								Wie groß dürfen Dokumente sein?
							</AccordionTrigger>
							<AccordionContent>
								Die maximale Upload-Größe pro Projekt beträgt standardmäßig 200
								MB. Einzelne Dateien sollten nicht größer als 50 MB sein, um eine
								schnelle Verarbeitung zu gewährleisten.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="doc-pages">
							<AccordionTrigger>
								Was passiert nach dem Upload?
							</AccordionTrigger>
							<AccordionContent>
                                                                Nach dem Upload extrahiert Tendera automatisch den Text aus dem
								Dokument. Dieser wird seitenweise gespeichert, sodass die KI
								später präzise Zitate mit Seitenzahlen liefern kann. Die
								Verarbeitung läuft im Hintergrund und dauert je nach Größe einige
								Sekunden bis Minuten.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="doc-multiple">
							<AccordionTrigger>
								Kann ich mehrere Dokumente in einem Projekt haben?
							</AccordionTrigger>
							<AccordionContent>
								Ja! Bei Standard-Analysen werden alle Dokumente gemeinsam
								durchsucht. Bei Offerten-Vergleichen wird automatisch das erste
								Dokument als Pflichtenheft markiert, weitere als Angebote. Du
								kannst auch Zusatzdokumente hochladen, die als Support-Material
								dienen.
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Team & Organisation</CardTitle>
					<CardDescription>
						Zusammenarbeit und Verwaltung
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="team-share">
							<AccordionTrigger>
								Wie teile ich Projekte mit meinem Team?
							</AccordionTrigger>
							<AccordionContent>
								Alle Projekte, Kriterienkataloge und Dokumente sind automatisch für alle
								Mitglieder deiner Organisation sichtbar. Du musst nichts manuell
								teilen – jeder im Team kann sofort auf alle Inhalte zugreifen und
								zusammenarbeiten.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="team-invite">
							<AccordionTrigger>
								Wie lade ich Teammitglieder ein?
							</AccordionTrigger>
							<AccordionContent>
								Gehe zu „Organisation" und klicke auf „Mitglied einladen". Gib
								die E-Mail-Adresse ein. Die Person erhält eine Einladungs-E-Mail
								und kann sich dann mit ihrem eigenen Account anmelden.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="team-org">
							<AccordionTrigger>
								Was ist eine Organisation?
							</AccordionTrigger>
							<AccordionContent>
								Eine Organisation ist dein Team-Workspace. Alle Projekte,
								Kriterienkataloge und Dokumente gehören zur Organisation, nicht zu
								einzelnen Benutzern. So kann dein Team nahtlos zusammenarbeiten,
								auch wenn Personen das Team verlassen.
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Export & Reporting</CardTitle>
					<CardDescription>
						Ergebnisse exportieren und teilen
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="export-results">
							<AccordionTrigger>
								Wie exportiere ich Analyse-Ergebnisse?
							</AccordionTrigger>
							<AccordionContent>
								Öffne das Projekt und gehe zu „Export". Du kannst eine
								druckfreundliche Ansicht aufrufen oder die Seite als PDF
								speichern (über die Druckfunktion deines Browsers). Die Ansicht
								enthält alle Ergebnisse mit Zitaten und Seitenzahlen.
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="export-offerten">
							<AccordionTrigger>
								Wie exportiere ich den Offerten-Vergleich?
							</AccordionTrigger>
							<AccordionContent>
								Die Vergleichsmatrix und Detailansichten sind druckfreundlich
								gestaltet. Nutze die Druckfunktion deines Browsers (Strg+P oder
								Cmd+P) und wähle „Als PDF speichern" als Drucker. So erhältst du
								einen professionellen Bericht mit allen Ergebnissen.
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
                                        <CardTitle>Tipps & Best Practices</CardTitle>
                                        <CardDescription>
                                                So holst du das Beste aus Tendera heraus
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="tips-quality">
							<AccordionTrigger>
								Wie verbessere ich die Qualität der KI-Analysen?
							</AccordionTrigger>
							<AccordionContent>
								<ul className="space-y-2 pl-5 list-disc">
									<li>
										Lade Dokumente mit klarem, selektierbarem Text hoch (keine
										eingescannten Bilder)
									</li>
									<li>
										Formuliere Fragen im Kriterienkatalog präzise und eindeutig
									</li>
									<li>
										Bei Offerten-Vergleichen: Stelle sicher, dass das
										Pflichtenheft strukturiert und klar formuliert ist
									</li>
									<li>
										Prüfe die Zitate – sie zeigen dir, auf welcher Grundlage die
										KI ihre Antworten gibt
									</li>
								</ul>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="tips-organize">
							<AccordionTrigger>
								Wie organisiere ich meine Projekte?
							</AccordionTrigger>
							<AccordionContent>
								<ul className="space-y-2 pl-5 list-disc">
									<li>
										Nutze aussagekräftige Projektnamen (z.B. „IT-Ausschreibung
										Zürich 2025")
									</li>
									<li>
										Verwende Tags, um Projekte nach Themen oder Kunden zu
										gruppieren
									</li>
									<li>
										Erstelle wiederverwendbare Kriterienkataloge für wiederkehrende
										Analysen
									</li>
									<li>
										Bei Offerten-Vergleichen: Benenne Angebote nach Anbieter für
										bessere Übersicht
									</li>
								</ul>
							</AccordionContent>
						</AccordionItem>

						<AccordionItem value="tips-workflow">
							<AccordionTrigger>
								Was ist der empfohlene Workflow?
							</AccordionTrigger>
							<AccordionContent>
								<strong>Für Standard-Analysen:</strong>
								<ol className="mt-2 list-decimal space-y-1 pl-5">
									<li>Kriterienkatalog erstellen (einmalig)</li>
									<li>Projekt mit Kriterienkatalog anlegen</li>
									<li>Dokument hochladen</li>
									<li>Analyse starten</li>
									<li>Ergebnisse prüfen und exportieren</li>
								</ol>
								<br />
								<strong>Für Offerten-Vergleiche:</strong>
								<ol className="mt-2 list-decimal space-y-1 pl-5">
									<li>Projekt als „Offerten-Vergleich" anlegen</li>
									<li>Pflichtenheft hochladen</li>
									<li>Kriterien automatisch extrahieren lassen</li>
									<li>Angebote hinzufügen und Dokumente hochladen</li>
									<li>Jedes Angebot prüfen lassen</li>
									<li>Vergleichsmatrix auswerten und exportieren</li>
								</ol>
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</CardContent>
			</Card>
		</div>
	);
}