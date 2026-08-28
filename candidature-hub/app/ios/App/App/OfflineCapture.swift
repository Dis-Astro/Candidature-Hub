import UIKit
import WebKit

fileprivate struct NativeOfflineOperation: Codable {
    let id: String
    let kind: String
    let createdAt: String
    let payload: [String: String]
}

fileprivate struct NativeSyncResult: Codable {
    let operationId: String
    let status: String
}

fileprivate struct NativeSyncResponse: Codable {
    let results: [NativeSyncResult]
}

final class OfflineOperationStore {
    static let shared = OfflineOperationStore()
    private let queue = DispatchQueue(label: "it.candidaturehub.offline-store")

    private var fileURL: URL? {
        guard let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("offline-operations.json")
    }

    var count: Int { queue.sync { load().count } }

    func addCandidate(firstName: String, lastName: String, email: String, phone: String, role: String) {
        queue.sync {
            var operations = load()
            var payload = ["firstName": firstName, "lastName": lastName]
            if !email.isEmpty { payload["email"] = email }
            if !phone.isEmpty { payload["phone"] = phone }
            if !role.isEmpty { payload["mansione"] = role }
            operations.append(NativeOfflineOperation(
                id: UUID().uuidString.replacingOccurrences(of: "-", with: "_"),
                kind: "candidate.create",
                createdAt: ISO8601DateFormatter().string(from: Date()),
                payload: payload
            ))
            save(operations)
        }
    }

    fileprivate func all() -> [NativeOfflineOperation] { queue.sync { load() } }

    fileprivate func remove(ids: Set<String>) {
        queue.sync { save(load().filter { !ids.contains($0.id) }) }
    }

    private func load() -> [NativeOfflineOperation] {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? JSONDecoder().decode([NativeOfflineOperation].self, from: data)) ?? []
    }

    private func save(_ operations: [NativeOfflineOperation]) {
        guard let fileURL, let data = try? JSONEncoder().encode(operations) else { return }
        try? data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}

final class NativeOfflineSync {
    static let shared = NativeOfflineSync()
    private var syncing = false

    func synchronize(serverURL: URL?, completion: @escaping (Int) -> Void) {
        let operations = OfflineOperationStore.shared.all()
        guard !syncing, let serverURL, !operations.isEmpty else {
            completion(OfflineOperationStore.shared.count)
            return
        }
        syncing = true

        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            var request = URLRequest(url: serverURL.appendingPathComponent("api/offline/sync"))
            request.httpMethod = "POST"
            request.timeoutInterval = 15
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            HTTPCookie.requestHeaderFields(with: cookies).forEach { request.setValue($1, forHTTPHeaderField: $0) }
            request.httpBody = try? JSONEncoder().encode(["operations": operations])

            URLSession.shared.dataTask(with: request) { data, response, _ in
                defer { self.syncing = false }
                guard let http = response as? HTTPURLResponse,
                      (200...299).contains(http.statusCode),
                      let data,
                      let body = try? JSONDecoder().decode(NativeSyncResponse.self, from: data) else {
                    DispatchQueue.main.async { completion(OfflineOperationStore.shared.count) }
                    return
                }
                let completed = Set(body.results.filter { $0.status == "applied" || $0.status == "duplicate" }.map(\.operationId))
                OfflineOperationStore.shared.remove(ids: completed)
                DispatchQueue.main.async { completion(OfflineOperationStore.shared.count) }
            }.resume()
        }
    }
}

final class OfflineCaptureViewController: UIViewController {
    var onSaved: (() -> Void)?
    private let firstName = UITextField()
    private let lastName = UITextField()
    private let email = UITextField()
    private let phone = UITextField()
    private let role = UITextField()

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Registrazione offline"
        view.backgroundColor = .systemGroupedBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Chiudi", style: .done, target: self, action: #selector(close))

        let titleLabel = UILabel()
        titleLabel.text = "Nuovo candidato"
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        titleLabel.adjustsFontForContentSizeCategory = true

        let explanation = UILabel()
        explanation.text = "Compila i dati essenziali. Saranno custoditi sull’iPad e inviati automaticamente dopo il nuovo accesso al server."
        explanation.numberOfLines = 0
        explanation.textColor = .secondaryLabel
        explanation.font = .preferredFont(forTextStyle: .body)

        configure(firstName, placeholder: "Nome *", contentType: .givenName)
        configure(lastName, placeholder: "Cognome *", contentType: .familyName)
        configure(email, placeholder: "Email", contentType: .emailAddress)
        email.keyboardType = .emailAddress
        configure(phone, placeholder: "Telefono", contentType: .telephoneNumber)
        phone.keyboardType = .phonePad
        configure(role, placeholder: "Mansione", contentType: nil)

        var saveConfiguration = UIButton.Configuration.filled()
        saveConfiguration.title = "Salva sull’iPad"
        saveConfiguration.baseBackgroundColor = UIColor(red: 0.055, green: 0.478, blue: 0.431, alpha: 1)
        saveConfiguration.cornerStyle = .large
        saveConfiguration.contentInsets = NSDirectionalEdgeInsets(top: 15, leading: 20, bottom: 15, trailing: 20)
        let saveButton = UIButton(configuration: saveConfiguration)
        saveButton.addTarget(self, action: #selector(saveCandidate), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [titleLabel, explanation, firstName, lastName, email, phone, role, saveButton])
        stack.axis = .vertical
        stack.spacing = 14
        stack.setCustomSpacing(24, after: explanation)
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 28),
            firstName.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            lastName.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            email.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            phone.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
            role.heightAnchor.constraint(greaterThanOrEqualToConstant: 52),
        ])
    }

    private func configure(_ field: UITextField, placeholder: String, contentType: UITextContentType?) {
        field.placeholder = placeholder
        field.textContentType = contentType
        field.borderStyle = .roundedRect
        field.backgroundColor = .secondarySystemGroupedBackground
        field.autocorrectionType = .no
        field.autocapitalizationType = contentType == .emailAddress ? .none : .words
        field.font = .preferredFont(forTextStyle: .body)
    }

    @objc private func saveCandidate() {
        let name = firstName.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let surname = lastName.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !name.isEmpty, !surname.isEmpty else {
            let alert = UIAlertController(title: "Dati mancanti", message: "Nome e cognome sono obbligatori.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
            return
        }
        OfflineOperationStore.shared.addCandidate(
            firstName: name,
            lastName: surname,
            email: email.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            phone: phone.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            role: role.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        )
        onSaved?()
        let alert = UIAlertController(title: "Salvato sull’iPad", message: "Il candidato verrà sincronizzato automaticamente quando il server sarà disponibile e avrai effettuato l’accesso.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Inserisci un altro", style: .default) { [weak self] _ in
            [self?.firstName, self?.lastName, self?.email, self?.phone, self?.role].forEach { $0?.text = "" }
            self?.firstName.becomeFirstResponder()
        })
        alert.addAction(UIAlertAction(title: "Chiudi", style: .cancel) { [weak self] _ in self?.dismiss(animated: true) })
        present(alert, animated: true)
    }

    @objc private func close() { dismiss(animated: true) }
}
